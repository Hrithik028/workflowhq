const express = require("express");
const jwt = require("jsonwebtoken");
const request = require("supertest");

const { errorHandler } = require("../src/middleware/errorMiddleware");
const githubIntegrationRoutes = require("../src/routes/githubIntegrationRoutes");
const { buildTestApp, testConfig } = require("./helpers/testApp");

const accessToken = (user) =>
  jwt.sign(
    {
      sub: String(user.id),
      email: user.email,
      role: "user",
      authVersion: Number(user.auth_version || 0),
      type: "access"
    },
    testConfig.jwtSecret,
    { expiresIn: "15m" }
  );

const buildGithubApp = (db) => {
  const app = express();
  app.locals.db = db;
  app.locals.config = testConfig;
  app.use(express.json());
  app.use("/api/github", githubIntegrationRoutes);
  app.use(errorHandler);
  return app;
};

describe("GitHub integration foundation", () => {
  let app;
  let db;
  let owner;
  let outsider;
  let ownerProject;
  let outsiderProject;
  let ownerTask;
  let repository;

  beforeEach(async () => {
    ({ db } = await buildTestApp());
    app = buildGithubApp(db);

    owner = (
      await db.query(
        `INSERT INTO users (name, email, password_hash)
         VALUES ('Owner', 'github-owner@example.com', 'hash') RETURNING id, email`
      )
    ).rows[0];
    outsider = (
      await db.query(
        `INSERT INTO users (name, email, password_hash)
         VALUES ('Outsider', 'github-outsider@example.com', 'hash') RETURNING id, email`
      )
    ).rows[0];
    ownerProject = (
      await db.query(
        `INSERT INTO projects (user_id, key, name)
         VALUES ($1, 'WHQ', 'WorkflowHQ') RETURNING id`,
        [owner.id]
      )
    ).rows[0];
    outsiderProject = (
      await db.query(
        `INSERT INTO projects (user_id, key, name)
         VALUES ($1, 'OUT', 'Private project') RETURNING id`,
        [outsider.id]
      )
    ).rows[0];
    await db.query(
      `INSERT INTO project_members (project_id, user_id, role)
       VALUES ($1, $2, 'owner'), ($3, $4, 'owner')`,
      [ownerProject.id, owner.id, outsiderProject.id, outsider.id]
    );
    ownerTask = (
      await db.query(
        `INSERT INTO tasks (user_id, project_id, issue_key, title)
         VALUES ($1, $2, 'WHQ-1', 'Connect repository activity') RETURNING id`,
        [owner.id, ownerProject.id]
      )
    ).rows[0];
    const installation = (
      await db.query(
        `INSERT INTO github_installations (
           user_id, github_installation_id, github_account_id, account_login,
           account_type, repository_selection
         ) VALUES ($1, 7001, 8001, 'workflowhq', 'Organization', 'selected')
         RETURNING id`,
        [owner.id]
      )
    ).rows[0];
    repository = (
      await db.query(
        `INSERT INTO github_repositories (
           user_id, installation_id, github_repository_id, github_node_id,
           owner_login, name, full_name, html_url
         ) VALUES ($1, $2, 9001, 'R_node', 'workflowhq', 'app',
                   'workflowhq/app', 'https://github.com/workflowhq/app')
         RETURNING id`,
        [owner.id, installation.id]
      )
    ).rows[0];
    await db.query(
      `INSERT INTO task_development_links (
         user_id, task_id, repository_id, link_type, external_id,
         title, url, state, occurred_at
       ) VALUES ($1, $2, $3, 'pull_request', '42', 'Add GitHub sync',
                 'https://github.com/workflowhq/app/pull/42', 'open', CURRENT_TIMESTAMP)`,
      [owner.id, ownerTask.id, repository.id]
    );
  });

  afterEach(async () => {
    await db.end();
  });

  it("reports installations, selects repositories, and returns task development links", async () => {
    const authorization = { Authorization: `Bearer ${accessToken(owner)}` };
    const status = await request(app).get("/api/github/status").set(authorization);
    const selected = await request(app)
      .put(`/api/github/repositories/${repository.id}/selection`)
      .set(authorization)
      .send({ selected: true, projectId: ownerProject.id });
    const repositories = await request(app)
      .get("/api/github/repositories?selected=true")
      .set(authorization);
    const development = await request(app)
      .get(`/api/github/tasks/${ownerTask.id}/development`)
      .set(authorization);

    expect(status.body.data).toMatchObject({ connected: true });
    expect(status.body.data.installations).toHaveLength(1);
    expect(selected.status, JSON.stringify(selected.body)).toBe(200);
    expect(selected.body.data.project_id).toBe(ownerProject.id);
    expect(repositories.status, JSON.stringify(repositories.body)).toBe(200);
    expect(repositories.body.data[0].full_name).toBe("workflowhq/app");
    expect(development.status, JSON.stringify(development.body)).toBe(200);
    expect(development.body.data.links[0]).toMatchObject({
      link_type: "pull_request",
      github_number: null,
      repository_full_name: "workflowhq/app"
    });
  });

  it("does not allow cross-user repository, project, or task access", async () => {
    const ownerAuthorization = { Authorization: `Bearer ${accessToken(owner)}` };
    const outsiderAuthorization = { Authorization: `Bearer ${accessToken(outsider)}` };

    const foreignProject = await request(app)
      .put(`/api/github/repositories/${repository.id}/selection`)
      .set(ownerAuthorization)
      .send({ selected: true, projectId: outsiderProject.id });
    const foreignRepository = await request(app)
      .put(`/api/github/repositories/${repository.id}/selection`)
      .set(outsiderAuthorization)
      .send({ selected: false, projectId: null });
    const foreignTask = await request(app)
      .get(`/api/github/tasks/${ownerTask.id}/development`)
      .set(outsiderAuthorization);

    expect(foreignProject.status).toBe(404);
    expect(foreignRepository.status).toBe(404);
    expect(foreignTask.status).toBe(404);
  });

  it("moves one repository between owned projects without creating duplicate assignments", async () => {
    const secondProject = (
      await db.query(
        `INSERT INTO projects (user_id, key, name)
         VALUES ($1, 'API', 'API platform') RETURNING id`,
        [owner.id]
      )
    ).rows[0];
    await db.query(
      "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'owner')",
      [secondProject.id, owner.id]
    );
    const authorization = { Authorization: `Bearer ${accessToken(owner)}` };

    const first = await request(app)
      .put(`/api/github/repositories/${repository.id}/selection`)
      .set(authorization)
      .send({ selected: true, projectId: ownerProject.id });
    const moved = await request(app)
      .put(`/api/github/repositories/${repository.id}/selection`)
      .set(authorization)
      .send({ selected: true, projectId: secondProject.id });
    const links = await db.query(
      "SELECT project_id FROM project_github_repositories WHERE repository_id=$1",
      [repository.id]
    );

    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    expect(moved.body.data).toMatchObject({
      selected: true,
      project_id: secondProject.id,
      project_key: "API",
      project_name: "API platform"
    });
    expect(links.rows).toEqual([{ project_id: secondProject.id }]);
  });

  it("creates a hashed one-time connection state and rejects callback replay", async () => {
    const github = {
      verifyInstallationForUser: globalThis.vi.fn().mockResolvedValue({
        id: 7100,
        account: { id: 8100, login: "workflow-owner", type: "User" },
        repository_selection: "selected",
        permissions: { contents: "read", pull_requests: "read" },
        suspended_at: null
      }),
      listInstallationRepositories: globalThis.vi.fn().mockResolvedValue([
        {
          id: 9100,
          node_id: "R_9100",
          owner: { login: "workflow-owner" },
          name: "connected-app",
          full_name: "workflow-owner/connected-app",
          html_url: "https://github.com/workflow-owner/connected-app",
          default_branch: "main",
          private: true,
          archived: false
        }
      ])
    };
    app.locals.config = {
      ...testConfig,
      githubIntegrationEnabled: true,
      githubAppSlug: "workflowhq-test",
      githubConnectStateTtlMinutes: 10
    };
    app.locals.github = github;
    const authorization = { Authorization: `Bearer ${accessToken(owner)}` };

    const started = await request(app).post("/api/github/connect").set(authorization);
    expect(started.status, JSON.stringify(started.body)).toBe(201);
    const installUrl = new URL(started.body.data.installUrl);
    const state = installUrl.searchParams.get("state");
    expect(installUrl.origin).toBe("https://github.com");
    expect(installUrl.pathname).toBe("/apps/workflowhq-test/installations/new");
    expect(state).toHaveLength(43);
    const stateRow = (
      await db.query(
        "SELECT state_hash, consumed_at FROM github_connection_states WHERE user_id=$1",
        [owner.id]
      )
    ).rows[0];
    expect(stateRow.state_hash).not.toBe(state);
    expect(stateRow.consumed_at).toBeNull();

    const callbackPath = `/api/github/callback?code=oauth-code&installation_id=7100&setup_action=install&state=${encodeURIComponent(state)}`;
    const callback = await request(app).get(callbackPath);
    expect(callback.status).toBe(303);
    expect(callback.headers.location).toBe(
      "http://localhost:5173/settings/integrations/github?result=connected"
    );
    expect(github.verifyInstallationForUser).toHaveBeenCalledWith({
      installationId: 7100,
      code: "oauth-code"
    });
    expect(github.listInstallationRepositories).toHaveBeenCalledWith(7100);
    expect(
      (await db.query("SELECT full_name FROM github_repositories WHERE github_repository_id=9100"))
        .rows[0].full_name
    ).toBe("workflow-owner/connected-app");

    const replay = await request(app).get(callbackPath);
    expect(replay.status).toBe(303);
    expect(replay.headers.location).toContain("result=failed");
    expect(replay.headers.location).toContain("reason=GITHUB_CONNECTION_STATE_INVALID");
    expect(github.verifyInstallationForUser).toHaveBeenCalledTimes(1);
  });

  it("imports bounded repository history and records sync progress without claiming deployments succeeded", async () => {
    const github = {
      listInstallationRepositories: globalThis.vi.fn().mockResolvedValue([
        {
          id: 9001,
          node_id: "R_node",
          owner: { login: "workflowhq" },
          name: "app",
          full_name: "workflowhq/app",
          html_url: "https://github.com/workflowhq/app",
          default_branch: "main",
          private: false,
          archived: false
        }
      ]),
      listRepositoryHistory: globalThis.vi.fn().mockResolvedValue({
        commits: [
          {
            sha: "commit-1",
            node_id: "C_1",
            html_url: "https://github.com/workflowhq/app/commit/commit-1",
            commit: {
              message: "WHQ-1 connect history",
              author: { date: "2026-09-01T00:00:00Z", name: "Octo Cat" }
            },
            author: { login: "octocat" }
          },
          {
            sha: "commit-old",
            node_id: "C_old",
            html_url: "https://github.com/workflowhq/app/commit/commit-old",
            commit: {
              message: "WHQ-1 stale commit",
              author: { date: "2025-01-01T00:00:00Z", name: "Octo Cat" }
            },
            author: { login: "octocat" }
          }
        ],
        pullRequests: [
          {
            id: 42,
            number: 42,
            title: "WHQ-1 verify history",
            body: "Ready",
            state: "open",
            updated_at: "2026-09-01T00:01:00Z",
            user: { login: "octocat" },
            head: { ref: "WHQ-1-history" }
          },
          {
            id: 420,
            number: 420,
            title: "WHQ-1 stale pull request",
            body: "Old",
            state: "closed",
            updated_at: "2025-01-01T00:00:00Z",
            user: { login: "octocat" },
            head: { ref: "WHQ-1-old" }
          }
        ],
        checkRuns: [
          {
            id: 43,
            name: "WHQ-1 test suite",
            status: "completed",
            conclusion: "success",
            completed_at: "2026-09-01T00:02:00Z",
            app: { slug: "github-actions" },
            head_branch: "WHQ-1-history"
          },
          {
            id: 430,
            name: "WHQ-1 stale check",
            status: "completed",
            conclusion: "success",
            completed_at: "2025-01-01T00:00:00Z",
            app: { slug: "github-actions" },
            head_branch: "WHQ-1-old"
          }
        ],
        deployments: [
          {
            id: 44,
            ref: "WHQ-1-release",
            environment: "production",
            created_at: "2026-09-01T00:03:00Z"
          },
          {
            id: 440,
            ref: "WHQ-1-old",
            environment: "production",
            created_at: "2025-01-01T00:00:00Z"
          }
        ],
        releases: [
          {
            id: 45,
            name: "WHQ-1 v1",
            tag_name: "v1",
            draft: false,
            published_at: "2026-09-01T00:04:00Z"
          },
          {
            id: 450,
            name: "WHQ-1 stale release",
            tag_name: "v0",
            draft: false,
            published_at: "2025-01-01T00:00:00Z"
          }
        ]
      }),
      getRateLimitState: () => ({
        remaining: 42,
        resetAt: "2026-09-01T01:00:00.000Z"
      })
    };
    app.locals.config = { ...testConfig, githubIntegrationEnabled: true };
    app.locals.github = github;
    const authorization = { Authorization: `Bearer ${accessToken(owner)}` };
    await request(app)
      .put(`/api/github/repositories/${repository.id}/selection`)
      .set(authorization)
      .send({ selected: true, projectId: ownerProject.id });
    const installation = (
      await db.query("SELECT id FROM github_installations WHERE user_id=$1", [owner.id])
    ).rows[0];

    const synced = await request(app)
      .post(`/api/github/installations/${installation.id}/sync`)
      .set(authorization);
    const events = await db.query(
      "SELECT event_type,external_id,state FROM github_development_events ORDER BY occurred_at"
    );
    const run = (
      await db.query(
        `SELECT status,processed_event_count,failed_repository_count,history_since,
                rate_limit_remaining,rate_limit_reset_at
         FROM github_sync_runs ORDER BY id DESC LIMIT 1`
      )
    ).rows[0];

    expect(synced.status, JSON.stringify(synced.body)).toBe(202);
    expect(synced.body.data).toMatchObject({
      status: "completed",
      imported: 5,
      failedRepositories: 0
    });
    expect(events.rows.map((event) => event.event_type)).toEqual([
      "commit",
      "pull_request",
      "check_run",
      "deployment",
      "release"
    ]);
    expect(events.rows.find((event) => event.event_type === "deployment").state).toBe("created");
    expect(events.rows.map((event) => event.external_id)).not.toEqual(
      expect.arrayContaining(["commit-old", "420", "430", "history-440", "450"])
    );
    expect(run).toMatchObject({
      status: "completed",
      processed_event_count: 5,
      failed_repository_count: 0,
      rate_limit_remaining: 42
    });
    expect(run.history_since).toBeTruthy();
    expect(run.rate_limit_reset_at).toBeTruthy();
  });

  it("reports a partial sync when selected repository history fails", async () => {
    const github = {
      listInstallationRepositories: globalThis.vi.fn().mockResolvedValue([
        {
          id: 9001,
          node_id: "R_node",
          owner: { login: "workflowhq" },
          name: "app",
          full_name: "workflowhq/app",
          html_url: "https://github.com/workflowhq/app",
          default_branch: "main"
        }
      ]),
      listRepositoryHistory: globalThis.vi.fn().mockRejectedValue(new Error("private failure")),
      getRateLimitState: () => ({ remaining: 0, resetAt: null })
    };
    app.locals.config = { ...testConfig, githubIntegrationEnabled: true };
    app.locals.github = github;
    const authorization = { Authorization: `Bearer ${accessToken(owner)}` };
    await request(app)
      .put(`/api/github/repositories/${repository.id}/selection`)
      .set(authorization)
      .send({ selected: true, projectId: ownerProject.id });
    const installation = (
      await db.query("SELECT id FROM github_installations WHERE user_id=$1", [owner.id])
    ).rows[0];

    const synced = await request(app)
      .post(`/api/github/installations/${installation.id}/sync`)
      .set(authorization);
    const currentInstallation = (
      await db.query("SELECT sync_status,last_sync_error FROM github_installations WHERE id=$1", [
        installation.id
      ])
    ).rows[0];
    const run = (
      await db.query(
        "SELECT status,error_message,failed_repository_count FROM github_sync_runs ORDER BY id DESC LIMIT 1"
      )
    ).rows[0];

    expect(synced.status, JSON.stringify(synced.body)).toBe(202);
    expect(synced.body.data).toMatchObject({
      status: "partial",
      imported: 0,
      failedRepositories: 1
    });
    expect(currentInstallation.sync_status).toBe("partial");
    expect(currentInstallation.last_sync_error).not.toContain("private failure");
    expect(run).toMatchObject({ status: "partial", failed_repository_count: 1 });
    expect(run.error_message).not.toContain("private failure");
  });

  it("returns truthful command metrics and project-scoped development history", async () => {
    const authorization = { Authorization: `Bearer ${accessToken(owner)}` };
    await request(app)
      .put(`/api/github/repositories/${repository.id}/selection`)
      .set(authorization)
      .send({ selected: true, projectId: ownerProject.id });
    const eventRows = await db.query(
      `INSERT INTO github_development_events (
         user_id, repository_id, event_type, external_id, github_number,
         title, url, state, actor_login, occurred_at, metadata
       ) VALUES
         ($1, $2, 'pull_request', 'pr-50', 50, 'Review WHQ-1',
          'https://github.com/workflowhq/app/pull/50', 'open', 'octocat', CURRENT_TIMESTAMP, '{}'),
         ($1, $2, 'check_run', 'check-51', NULL, 'WHQ-1 tests',
          'https://github.com/workflowhq/app/actions/runs/51', 'failure', 'github-actions', CURRENT_TIMESTAMP, '{}'),
         ($1, $2, 'deployment', 'deploy-52', NULL, 'Production deployment',
          'https://github.com/workflowhq/app/deployments/52', 'success', 'deploy-bot', CURRENT_TIMESTAMP, '{}')
       RETURNING id, event_type`,
      [owner.id, repository.id]
    );
    const pullRequest = eventRows.rows.find((event) => event.event_type === "pull_request");
    await db.query(
      `INSERT INTO github_development_event_tasks (event_id, task_id, link_source)
       VALUES ($1, $2, 'automatic')`,
      [pullRequest.id, ownerTask.id]
    );

    const summary = await request(app).get("/api/github/summary").set(authorization);
    const development = await request(app)
      .get(`/api/github/projects/${ownerProject.id}/development`)
      .set(authorization);
    const outsiderView = await request(app)
      .get(`/api/github/projects/${ownerProject.id}/development`)
      .set({ Authorization: `Bearer ${accessToken(outsider)}` });

    expect(summary.status, JSON.stringify(summary.body)).toBe(200);
    expect(summary.body.data).toMatchObject({
      connected: true,
      repository_count: 1,
      contributor_count: 3,
      open_pull_request_count: 1,
      failing_check_count: 1,
      deployed_this_week_count: 1
    });
    expect(summary.body.data.recent).toHaveLength(3);
    expect(development.status, JSON.stringify(development.body)).toBe(200);
    expect(development.body.data.project).toMatchObject({
      id: ownerProject.id,
      key: "WHQ",
      my_role: "owner"
    });
    expect(development.body.data.repositories[0].full_name).toBe("workflowhq/app");
    expect(development.body.data.events).toHaveLength(3);
    expect(development.body.data.task_links[0]).toMatchObject({
      event_id: pullRequest.id,
      task_id: ownerTask.id,
      issue_key: "WHQ-1",
      link_source: "automatic"
    });
    expect(outsiderView.status).toBe(404);
  });
});
