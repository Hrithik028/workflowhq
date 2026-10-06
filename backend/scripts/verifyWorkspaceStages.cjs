// Non-production QA only: adds synthetic records; never drops or deletes data.
const assert = require("node:assert/strict");
const { Pool } = require("pg");
const request = require("supertest");
const { createApp } = require("../src/app");
const { testConfig } = require("../tests/helpers/testApp");
const { importGithubDevelopmentPayload } = require("../src/lib/githubWebhookService");

async function verify() {
  const url = new URL(process.env.WORKFLOWHQ_TEST_DATABASE_URL);
  assert(["127.0.0.1", "localhost"].includes(url.hostname));
  assert(/^\/workflowhq_qa_[a-z0-9_]+$/.test(url.pathname));
  const db = new Pool({ connectionString: url.toString() });
  try {
    const app = createApp({ db, config: { ...testConfig, workspacesEnabled: true } });
    const tag = Date.now();
    const owner = (
      await request(app)
        .post("/api/auth/register")
        .send({
          name: "Stage QA",
          email: `stages-${tag}@local.workflowhq.test`,
          password: "local-browser-qa-password"
        })
    ).body.data;
    const other = (
      await request(app)
        .post("/api/auth/register")
        .send({
          name: "Other QA",
          email: `other-${tag}@local.workflowhq.test`,
          password: "local-browser-qa-password"
        })
    ).body.data;
    assert(owner?.accessToken && other?.accessToken);
    const authorization = { Authorization: `Bearer ${owner.accessToken}` };
    const project = (
      await request(app)
        .post("/api/projects")
        .set(authorization)
        .send({ key: "STQA", name: "Stage constraints QA" })
    ).body.data;
    assert(project?.id);
    const configuration = (
      await request(app).get(`/api/projects/${project.id}/workflow`).set(authorization)
    ).body.data;
    const rules = configuration.rules.map(({ trigger, enabled, fromStatus, toStatus }) => ({
      trigger,
      enabled,
      fromStatus,
      toStatus
    }));
    const statuses = [
      ...configuration.statuses.map(({ status, label, category }) => ({ status, label, category })),
      { status: "review", label: "Review", category: "in_progress" },
      { status: "qa", label: "QA", category: "in_progress" }
    ];
    const transitions = [{ fromStatus: "review", toStatus: "qa" }];
    assert.equal(
      (
        await request(app)
          .put(`/api/projects/${project.id}/workflow`)
          .set(authorization)
          .send({ rules, statuses, transitions })
      ).status,
      200
    );
    const input = {
      projectId: project.id,
      title: "Stage persistence",
      status: "in_progress",
      workflowStage: "review"
    };
    const created = await request(app).post("/api/tasks").set(authorization).send(input);
    assert.equal(created.status, 201);
    const id = created.body.data.id;
    const moved = await request(app)
      .put(`/api/tasks/${id}`)
      .set(authorization)
      .send({ ...input, workflowStage: "qa" });
    assert.equal(moved.status, 200);
    assert.equal(moved.body.data.workflow_stage, "qa");
    assert.equal(moved.body.data.status, "in_progress");
    assert.equal(
      (await request(app).put(`/api/tasks/${id}`).set(authorization).send(input)).status,
      409
    );
    assert.equal(
      (
        await request(app)
          .get(`/api/tasks/${id}`)
          .set({ Authorization: `Bearer ${other.accessToken}` })
      ).status,
      404
    );
    await assert.rejects(
      db.query("INSERT INTO tasks(user_id,title) VALUES($1,'Missing root')", [owner.user.id]),
      (error) => error.code === "23502"
    );
    await assert.rejects(
      db.query("UPDATE tasks SET workspace_id=$1 WHERE id=$2", [other.activeWorkspaceId, id]),
      (error) => error.code === "23503"
    );
    await assert.rejects(
      db.query("UPDATE tasks SET status='completed' WHERE id=$1", [id]),
      (error) => error.code === "23503"
    );
    const installation = (
      await db.query(
        `INSERT INTO github_installations(user_id,workspace_id,github_installation_id,github_account_id,account_login,account_type,repository_selection)
      VALUES($1,$2,$3,$4,'local-qa','User','selected') RETURNING *`,
        [owner.user.id, owner.activeWorkspaceId, tag, tag + 1]
      )
    ).rows[0];
    await importGithubDevelopmentPayload({
      db,
      installation: {
        ...installation,
        workspace_id: other.activeWorkspaceId,
        connection_status: "active"
      },
      eventName: "push",
      payload: {
        repository: {
          id: tag + 2,
          full_name: "local-qa/stages",
          name: "stages",
          owner: { login: "local-qa" }
        },
        commits: []
      }
    });
    const repository = (
      await db.query("SELECT * FROM github_repositories WHERE github_repository_id=$1", [tag + 2])
    ).rows[0];
    assert.equal(Number(repository.workspace_id), Number(owner.activeWorkspaceId));
    await assert.rejects(
      db.query(
        "INSERT INTO project_github_repositories(repository_id,project_id,linked_by,workspace_id) VALUES($1,$2,$3,$4)",
        [repository.id, project.id, owner.user.id, other.activeWorkspaceId]
      ),
      (error) => error.code === "23503"
    );
    process.stdout.write(
      "PASS real PostgreSQL roots, cross-tenant links, webhook root derivation, stage consistency and permitted moves\n"
    );
  } finally {
    await db.end();
  }
}
verify().catch((error) => {
  process.stderr.write(error.message + "\n");
  process.exitCode = 1;
});
