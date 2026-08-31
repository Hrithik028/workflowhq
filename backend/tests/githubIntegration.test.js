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
    expect(selected.body.data.project_id).toBe(ownerProject.id);
    expect(repositories.body.data[0].full_name).toBe("workflowhq/app");
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
});
