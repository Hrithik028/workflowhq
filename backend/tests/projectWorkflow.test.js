const request = require("supertest");

const { auth, buildTestApp, registerUser } = require("./helpers/testApp");

const projectPayload = {
  key: "WHQ",
  name: "WorkflowHQ",
  description: "Developer delivery workspace."
};

const configuredRules = [
  {
    trigger: "commit_pushed",
    enabled: true,
    fromStatus: "todo",
    toStatus: "in_progress"
  },
  {
    trigger: "pull_request_opened",
    enabled: false,
    fromStatus: "todo",
    toStatus: "in_progress"
  },
  {
    trigger: "pull_request_merged",
    enabled: true,
    fromStatus: "in_progress",
    toStatus: "completed"
  },
  {
    trigger: "check_run_succeeded",
    enabled: true,
    fromStatus: "in_progress",
    toStatus: "completed"
  },
  {
    trigger: "deployment_succeeded",
    enabled: false,
    fromStatus: "in_progress",
    toStatus: "completed"
  }
];

describe("project GitHub workflow rules", () => {
  let app;
  let db;
  let owner;
  let projectId;

  beforeEach(async () => {
    ({ app, db } = await buildTestApp());
    owner = await registerUser(app, "workflow-rule-owner");
    const project = await request(app)
      .post("/api/projects")
      .set(auth(owner.token))
      .send(projectPayload);
    projectId = project.body.data.id;
  });

  afterEach(async () => {
    await db.end();
  });

  it("creates the safe default rules for every new project", async () => {
    const response = await request(app)
      .get(`/api/projects/${projectId}/workflow`)
      .set(auth(owner.token));

    expect(response.status).toBe(200);
    expect(response.body.data.project).toMatchObject({ id: projectId, key: "WHQ" });
    expect(response.body.data.rules).toHaveLength(5);
    expect(response.body.data.rules.map((rule) => [rule.trigger, rule.enabled])).toEqual([
      ["commit_pushed", true],
      ["pull_request_opened", true],
      ["pull_request_merged", true],
      ["check_run_succeeded", false],
      ["deployment_succeeded", false]
    ]);
  });

  it("lets the project owner configure forward-only automation and audits the change", async () => {
    const response = await request(app)
      .put(`/api/projects/${projectId}/workflow`)
      .set(auth(owner.token))
      .send({ rules: configuredRules });
    const activity = (
      await db.query(
        `SELECT action, entity_id, details
         FROM activities WHERE action = 'project_workflow_updated'`
      )
    ).rows[0];

    expect(response.status).toBe(200);
    expect(response.body.data.rules.find((rule) => rule.trigger === "check_run_succeeded"))
      .toMatchObject({ enabled: true, fromStatus: "in_progress", toStatus: "completed" });
    expect(activity.action).toBe("project_workflow_updated");
    expect(Number(activity.entity_id)).toBe(projectId);
    expect(activity.details.enabledTriggers).toContain("check_run_succeeded");
  });

  it("rejects missing, duplicate, and backward rules", async () => {
    const missing = await request(app)
      .put(`/api/projects/${projectId}/workflow`)
      .set(auth(owner.token))
      .send({ rules: configuredRules.slice(0, 4) });
    const duplicate = await request(app)
      .put(`/api/projects/${projectId}/workflow`)
      .set(auth(owner.token))
      .send({ rules: [...configuredRules.slice(0, 4), configuredRules[0]] });
    const backward = await request(app)
      .put(`/api/projects/${projectId}/workflow`)
      .set(auth(owner.token))
      .send({
        rules: configuredRules.map((rule) =>
          rule.trigger === "commit_pushed"
            ? { ...rule, fromStatus: "in_progress", toStatus: "todo" }
            : rule
        )
      });

    expect(missing.status).toBe(400);
    expect(duplicate.status).toBe(400);
    expect(backward.status).toBe(400);
    expect(backward.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("keeps workflow configuration owner-only", async () => {
    const editor = await registerUser(app, "workflow-rule-editor");
    await request(app)
      .post(`/api/projects/${projectId}/members`)
      .set(auth(owner.token))
      .send({ email: editor.user.email, role: "editor" });

    const readAttempt = await request(app)
      .get(`/api/projects/${projectId}/workflow`)
      .set(auth(editor.token));
    const writeAttempt = await request(app)
      .put(`/api/projects/${projectId}/workflow`)
      .set(auth(editor.token))
      .send({ rules: configuredRules });

    expect(readAttempt.status).toBe(404);
    expect(writeAttempt.status).toBe(404);
  });
});
