const request = require("supertest");

const { auth, buildTestApp, registerUser } = require("./helpers/testApp");

describe("GitHub identity mapping and webhook recovery", () => {
  let app;
  let db;
  let github;
  let owner;
  let member;
  let outsider;
  let projectId;
  let installation;
  let repository;

  beforeEach(async () => {
    github = { redeliverAppWebhook: globalThis.vi.fn().mockResolvedValue({ id: 444 }) };
    ({ app, db } = await buildTestApp({
      config: { githubIntegrationEnabled: true },
      github
    }));
    owner = await registerUser(app, "identity-owner");
    member = await registerUser(app, "identity-member");
    outsider = await registerUser(app, "identity-outsider");
    const project = await request(app)
      .post("/api/projects")
      .set(auth(owner.token))
      .send({ key: "WHQ", name: "WorkflowHQ", description: "Developer platform" });
    projectId = project.body.data.id;
    await request(app)
      .post(`/api/projects/${projectId}/members`)
      .set(auth(owner.token))
      .send({ email: member.user.email, role: "editor" });
    installation = (
      await db.query(
        `INSERT INTO github_installations
           (user_id, github_installation_id, github_account_id, account_login,
            account_type, repository_selection)
         VALUES ($1, 7001, 8001, 'WorkflowHQ', 'Organization', 'selected')
         RETURNING id`,
        [owner.user.id]
      )
    ).rows[0];
    repository = (
      await db.query(
        `INSERT INTO github_repositories
           (user_id, installation_id, github_repository_id, github_node_id,
            owner_login, name, full_name, html_url, selected)
         VALUES ($1, $2, 9001, 'R_9001', 'workflowhq', 'app',
                 'workflowhq/app', 'https://github.com/workflowhq/app', TRUE)
         RETURNING id`,
        [owner.user.id, installation.id]
      )
    ).rows[0];
    await db.query(
      `INSERT INTO project_github_repositories (repository_id, project_id, linked_by)
       VALUES ($1, $2, $3)`,
      [repository.id, projectId, owner.user.id]
    );
    await db.query(
      `INSERT INTO github_development_events
         (user_id, repository_id, event_type, external_id, title, url,
          actor_login, occurred_at)
       VALUES ($1, $2, 'commit', 'abc123', 'WHQ-1 start work',
               'https://github.com/workflowhq/app/commit/abc123', 'octocat',
               CURRENT_TIMESTAMP)`,
      [owner.user.id, repository.id]
    );
  });

  afterEach(async () => {
    await db.end();
  });

  it("maps an observed GitHub actor only to an eligible project member", async () => {
    const before = await request(app)
      .get("/api/github/identities")
      .set(auth(owner.token));
    const invalid = await request(app)
      .put("/api/github/identities")
      .set(auth(owner.token))
      .send({
        installationId: installation.id,
        githubLogin: "octocat",
        userId: outsider.user.id
      });
    const mapped = await request(app)
      .put("/api/github/identities")
      .set(auth(owner.token))
      .send({
        installationId: installation.id,
        githubLogin: "OCTOCAT",
        userId: member.user.id
      });
    const remapped = await request(app)
      .put("/api/github/identities")
      .set(auth(owner.token))
      .send({
        installationId: installation.id,
        githubLogin: "octocat",
        userId: owner.user.id
      });
    const after = await request(app)
      .get("/api/github/identities")
      .set(auth(owner.token));

    expect(before.status).toBe(200);
    expect(before.body.data.actors[0]).toMatchObject({
      actor_login: "octocat",
      event_count: 1,
      mapping: null
    });
    expect(before.body.data.members.map((candidate) => Number(candidate.user_id))).toEqual(
      expect.arrayContaining([owner.user.id, member.user.id])
    );
    expect(invalid.status).toBe(422);
    expect(invalid.body.error.code).toBe("GITHUB_IDENTITY_MEMBER_REQUIRED");
    expect(mapped.status).toBe(200);
    expect(mapped.body.data).toMatchObject({
      github_login: "octocat",
      mapped_user_id: member.user.id,
      mapped_user_name: member.user.name
    });
    expect(remapped.status).toBe(200);
    expect(remapped.body.data.mapped_user_name).toBe(owner.user.name);
    expect(after.body.data.actors[0].mapping.mapped_user_name).toBe(owner.user.name);
  });

  it("enriches historical development data dynamically and permits unmapping", async () => {
    const mapped = await request(app)
      .put("/api/github/identities")
      .set(auth(owner.token))
      .send({
        installationId: installation.id,
        githubLogin: "octocat",
        userId: member.user.id
      });
    const development = await request(app)
      .get(`/api/github/projects/${projectId}/development`)
      .set(auth(member.token));
    const removed = await request(app)
      .delete(`/api/github/identities/${mapped.body.data.id}`)
      .set(auth(owner.token));
    const hiddenFromOutsider = await request(app)
      .delete(`/api/github/identities/${mapped.body.data.id}`)
      .set(auth(outsider.token));

    expect(development.status).toBe(200);
    expect(development.body.data.events[0]).toMatchObject({
      actor_login: "octocat",
      actor_user_id: member.user.id,
      actor_name: member.user.name
    });
    expect(removed.status).toBe(204);
    expect(hiddenFromOutsider.status).toBe(404);
  });

  it("lists sanitized recent failures and requests a capped GitHub redelivery", async () => {
    const delivery = (
      await db.query(
        `INSERT INTO github_webhook_deliveries
           (user_id, installation_id, github_delivery_id, event_name, event_action,
            payload_sha256, signature_verified_at, status, attempt_count, error_message)
         VALUES ($1, $2, 'delivery-guid', 'push', NULL, $3,
                 CURRENT_TIMESTAMP, 'failed', 1, 'Webhook processing failed.')
         RETURNING id`,
        [owner.user.id, installation.id, "a".repeat(64)]
      )
    ).rows[0];
    const failures = await request(app)
      .get("/api/github/webhook-deliveries/failed")
      .set(auth(owner.token));
    const retry = await request(app)
      .post(`/api/github/webhook-deliveries/${delivery.id}/redeliver`)
      .set(auth(owner.token));
    const cooldown = await request(app)
      .post(`/api/github/webhook-deliveries/${delivery.id}/redeliver`)
      .set(auth(owner.token));
    const denied = await request(app)
      .post(`/api/github/webhook-deliveries/${delivery.id}/redeliver`)
      .set(auth(outsider.token));

    expect(failures.status).toBe(200);
    expect(failures.body.data[0]).toMatchObject({
      event_name: "push",
      status: "failed",
      error_message: "Webhook processing failed.",
      redelivery_available: true,
      redelivery_blocked_reason: null
    });
    expect(failures.body.data[0].payload_sha256).toBeUndefined();
    expect(retry.status).toBe(202);
    expect(github.redeliverAppWebhook).toHaveBeenCalledWith({
      guid: "delivery-guid",
      installationId: 7001
    });
    expect(cooldown.status).toBe(429);
    expect(denied.status).toBe(404);
  });

  it("refuses redelivery outside GitHub's three-day recovery window", async () => {
    const delivery = (
      await db.query(
        `INSERT INTO github_webhook_deliveries
           (user_id, installation_id, github_delivery_id, event_name,
            payload_sha256, signature_verified_at, status, attempt_count, received_at)
         VALUES ($1, $2, 'expired-guid', 'push', $3,
                 CURRENT_TIMESTAMP, 'failed', 1, CURRENT_TIMESTAMP - INTERVAL '4 days')
         RETURNING id`,
        [owner.user.id, installation.id, "b".repeat(64)]
      )
    ).rows[0];
    const response = await request(app)
      .post(`/api/github/webhook-deliveries/${delivery.id}/redeliver`)
      .set(auth(owner.token));

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("GITHUB_REDELIVERY_EXPIRED");
    expect(github.redeliverAppWebhook).not.toHaveBeenCalled();
  });
});
