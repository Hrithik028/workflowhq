const { createHmac } = require("node:crypto");

const express = require("express");
const request = require("supertest");

const { verifyGithubWebhookSignature } = require("../src/lib/githubWebhookSecurity");
const { errorHandler } = require("../src/middleware/errorMiddleware");
const githubWebhookRoutes = require("../src/routes/githubWebhookRoutes");
const { buildTestApp, testConfig } = require("./helpers/testApp");

const webhookSecret = "github-webhook-test-secret";
const repositoryPayload = {
  id: 9001,
  node_id: "R_9001",
  name: "app",
  full_name: "workflowhq/app",
  html_url: "https://github.com/workflowhq/app",
  default_branch: "main",
  private: true,
  archived: false,
  owner: { login: "workflowhq" }
};

const buildWebhookApp = (db) => {
  const app = express();
  app.locals.db = db;
  app.locals.config = {
    ...testConfig,
    githubIntegrationEnabled: true,
    githubWebhookSecret: webhookSecret
  };
  // This order is intentional: signature verification must see the raw bytes.
  app.use("/api/github/webhooks", githubWebhookRoutes);
  app.use(express.json());
  app.use(errorHandler);
  return app;
};

const signedRequest = (app, eventName, payload, deliveryId = `delivery-${Date.now()}`) => {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  const signature = `sha256=${createHmac("sha256", webhookSecret).update(body).digest("hex")}`;
  return request(app)
    .post("/api/github/webhooks")
    .set("content-type", "application/json")
    .set("x-github-delivery", deliveryId)
    .set("x-github-event", eventName)
    .set("x-hub-signature-256", signature)
    .send(body);
};

describe("GitHub webhook security and processing", () => {
  let app;
  let db;
  let installation;
  let repository;
  let project;
  let task;

  beforeEach(async () => {
    ({ db } = await buildTestApp());
    app = buildWebhookApp(db);
    const user = (
      await db.query(
        `INSERT INTO users (name,email,password_hash)
         VALUES ('Webhook owner','webhook-owner@example.com','hash') RETURNING id`
      )
    ).rows[0];
    project = (
      await db.query(
        `INSERT INTO projects (user_id,key,name) VALUES ($1,'WHQ','WorkflowHQ') RETURNING id`,
        [user.id]
      )
    ).rows[0];
    task = (
      await db.query(
        `INSERT INTO tasks (user_id,project_id,issue_key,title)
         VALUES ($1,$2,'WHQ-1','Secure GitHub webhooks') RETURNING id`,
        [user.id, project.id]
      )
    ).rows[0];
    installation = (
      await db.query(
        `INSERT INTO github_installations (user_id,github_installation_id,github_account_id,
           account_login,account_type,repository_selection)
         VALUES ($1,7001,8001,'workflowhq','Organization','selected') RETURNING id,user_id`,
        [user.id]
      )
    ).rows[0];
    repository = (
      await db.query(
        `INSERT INTO github_repositories (user_id,installation_id,github_repository_id,
           github_node_id,owner_login,name,full_name,html_url,selected)
         VALUES ($1,$2,9001,'R_9001','workflowhq','app','workflowhq/app',
                 'https://github.com/workflowhq/app',TRUE) RETURNING id`,
        [user.id, installation.id]
      )
    ).rows[0];
    await db.query(
      `INSERT INTO project_github_repositories (repository_id,project_id,linked_by)
       VALUES ($1,$2,$3)`,
      [repository.id, project.id, user.id]
    );
  });

  afterEach(async () => {
    await db.end();
  });

  it("matches GitHub's published HMAC-SHA256 test vector", () => {
    expect(
      verifyGithubWebhookSignature({
        rawBody: Buffer.from("Hello, World!", "utf8"),
        signature: "sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17",
        secret: "It's a Secret to Everybody"
      })
    ).toBe(true);
  });

  it("rejects missing or invalid headers and signatures before writing a receipt", async () => {
    const body = JSON.stringify({ installation: { id: 7001 } });
    const invalid = await request(app)
      .post("/api/github/webhooks")
      .set("content-type", "application/json")
      .set("x-github-delivery", "invalid-signature")
      .set("x-github-event", "push")
      .set("x-hub-signature-256", `sha256=${"0".repeat(64)}`)
      .send(body);
    const missing = await request(app)
      .post("/api/github/webhooks")
      .set("content-type", "application/json")
      .send(body);
    const receipts = await db.query("SELECT id FROM github_webhook_deliveries");

    expect(invalid.status).toBe(401);
    expect(missing.status).toBe(400);
    expect(receipts.rows).toHaveLength(0);
  });

  it("does not process signed webhooks while the GitHub integration flag is disabled", async () => {
    app.locals.config.githubIntegrationEnabled = false;
    const response = await signedRequest(
      app,
      "push",
      { installation: { id: 7001 }, repository: repositoryPayload, commits: [] },
      "disabled-integration"
    );

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("GITHUB_WEBHOOK_UNAVAILABLE");
    expect(
      (
        await db.query(
          "SELECT id FROM github_webhook_deliveries WHERE github_delivery_id='disabled-integration'"
        )
      ).rows
    ).toHaveLength(0);
  });

  it("records unknown events as ignored without retaining the raw payload", async () => {
    const response = await signedRequest(
      app,
      "future_github_event",
      { installation: { id: 7001 }, sensitive_field: "must-not-be-stored" },
      "unknown-event"
    );
    const receipt = (
      await db.query(
        `SELECT event_name,status,payload_sha256 FROM github_webhook_deliveries
         WHERE github_delivery_id='unknown-event'`
      )
    ).rows[0];

    expect(response.status).toBe(202);
    expect(response.body.data.status).toBe("ignored");
    expect(receipt).toMatchObject({ event_name: "future_github_event", status: "ignored" });
    expect(JSON.stringify(receipt)).not.toContain("must-not-be-stored");
  });

  it("deduplicates an identical delivery and rejects the same id with a different hash", async () => {
    const firstPayload = { installation: { id: 7001 }, action: "noop" };
    const first = await signedRequest(app, "future_event", firstPayload, "replay-safe");
    const duplicate = await signedRequest(app, "future_event", firstPayload, "replay-safe");
    const conflict = await signedRequest(
      app,
      "future_event",
      { installation: { id: 7001 }, action: "changed" },
      "replay-safe"
    );
    const receipts = await db.query(
      "SELECT status,attempt_count FROM github_webhook_deliveries WHERE github_delivery_id='replay-safe'"
    );

    expect(first.status).toBe(202);
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.data.duplicate).toBe(true);
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe("GITHUB_WEBHOOK_REPLAY_CONFLICT");
    expect(receipts.rows).toHaveLength(1);
    expect(receipts.rows[0].attempt_count).toBe(1);
  });

  it("updates installation and repository lifecycle state without deleting history", async () => {
    const installationPayload = {
      id: 7001,
      account: { id: 8001, login: "workflowhq", type: "Organization" },
      repository_selection: "selected",
      permissions: { contents: "read" }
    };
    await signedRequest(
      app,
      "installation",
      { action: "suspend", installation: installationPayload },
      "life-1"
    );
    await signedRequest(
      app,
      "installation",
      { action: "unsuspend", installation: installationPayload },
      "life-2"
    );
    await signedRequest(
      app,
      "installation_repositories",
      {
        action: "removed",
        installation: installationPayload,
        repository_selection: "selected",
        repositories_added: [],
        repositories_removed: [repositoryPayload]
      },
      "life-3"
    );
    await signedRequest(
      app,
      "installation",
      { action: "deleted", installation: installationPayload },
      "life-4"
    );

    const currentInstallation = (
      await db.query(
        "SELECT connection_status,disconnected_at FROM github_installations WHERE id=$1",
        [installation.id]
      )
    ).rows[0];
    const currentRepository = (
      await db.query("SELECT removed_at,selected FROM github_repositories WHERE id=$1", [
        repository.id
      ])
    ).rows[0];
    const links = await db.query(
      "SELECT * FROM project_github_repositories WHERE repository_id=$1",
      [repository.id]
    );

    expect(currentInstallation.connection_status).toBe("revoked");
    expect(currentInstallation.disconnected_at).toBeTruthy();
    expect(currentRepository.removed_at).toBeTruthy();
    expect(currentRepository.selected).toBe(false);
    expect(links.rows).toHaveLength(0);
  });

  it("normalizes supported events and links only exact keys in linked projects", async () => {
    const otherProject = (
      await db.query(
        `INSERT INTO projects (user_id,key,name) VALUES ($1,'OTH','Other') RETURNING id`,
        [installation.user_id]
      )
    ).rows[0];
    const otherTask = (
      await db.query(
        `INSERT INTO tasks (user_id,project_id,issue_key,title)
        VALUES ($1,$2,'OTH-1','Not linked') RETURNING id`,
        [installation.user_id, otherProject.id]
      )
    ).rows[0];
    const base = {
      installation: { id: 7001 },
      repository: repositoryPayload,
      sender: { login: "octocat" }
    };
    const cases = [
      [
        "push",
        {
          ...base,
          ref: "refs/heads/WHQ-1-webhooks",
          commits: [
            { id: "c1", message: "WHQ-1 verify signature", timestamp: "2026-08-31T10:00:00Z" }
          ]
        }
      ],
      [
        "pull_request",
        {
          ...base,
          action: "opened",
          number: 42,
          pull_request: {
            id: 42,
            number: 42,
            title: "WHQ-1 not OTH-1",
            body: "Ready",
            state: "open",
            updated_at: "2026-08-31T10:01:00Z",
            user: { login: "octocat" },
            head: { ref: "WHQ-1-webhooks" }
          }
        }
      ],
      [
        "check_run",
        {
          ...base,
          action: "completed",
          check_run: {
            id: 43,
            name: "WHQ-1 tests",
            status: "completed",
            conclusion: "success",
            completed_at: "2026-08-31T10:02:00Z"
          }
        }
      ],
      [
        "deployment_status",
        {
          ...base,
          deployment: { id: 44, ref: "WHQ-1-release", environment: "production" },
          deployment_status: {
            id: 45,
            state: "success",
            environment_url: "http://169.254.169.254/latest/meta-data",
            created_at: "2026-08-31T10:03:00Z"
          }
        }
      ],
      [
        "release",
        {
          ...base,
          action: "published",
          release: {
            id: 46,
            name: "WHQ-1 v1",
            tag_name: "v1",
            published_at: "2026-08-31T10:04:00Z"
          }
        }
      ]
    ];
    for (let index = 0; index < cases.length; index += 1) {
      const response = await signedRequest(
        app,
        cases[index][0],
        cases[index][1],
        `development-${index}`
      );
      expect(response.status, JSON.stringify(response.body)).toBe(202);
    }

    const events = await db.query(
      "SELECT event_type,url FROM github_development_events ORDER BY id"
    );
    const linked = await db.query(
      "SELECT task_id FROM github_development_event_tasks ORDER BY event_id"
    );
    expect(events.rows.map((row) => row.event_type)).toEqual([
      "commit",
      "pull_request",
      "check_run",
      "deployment",
      "release"
    ]);
    expect(events.rows.find((row) => row.event_type === "deployment").url).toBe(
      "https://github.com/workflowhq/app"
    );
    expect(linked.rows).toHaveLength(5);
    expect(linked.rows.every((row) => Number(row.task_id) === Number(task.id))).toBe(true);
    expect(linked.rows.some((row) => Number(row.task_id) === Number(otherTask.id))).toBe(false);
  });

  it("enforces the one-megabyte raw-body limit", async () => {
    const oversized = JSON.stringify({ installation: { id: 7001 }, data: "x".repeat(1024 * 1024) });
    const response = await signedRequest(app, "push", oversized, "oversized");
    expect(response.status).toBe(413);
    expect(
      (
        await db.query(
          "SELECT id FROM github_webhook_deliveries WHERE github_delivery_id='oversized'"
        )
      ).rows
    ).toHaveLength(0);
  });
});
