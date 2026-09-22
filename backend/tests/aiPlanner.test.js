const request = require("supertest");

const { auth, buildTestApp, registerUser } = require("./helpers/testApp");

const plan = {
  summary: "Ship a safe provider-neutral planning workflow.",
  tasks: [
    {
      tempId: "epic-ai",
      parentTempId: null,
      taskType: "epic",
      title: "AI planning foundation",
      description: "Create the provider-neutral planning boundary.",
      priority: "medium",
      dueDate: null,
      acceptanceCriteria: ["Provider output is validated before preview."]
    },
    {
      tempId: "task-preview",
      parentTempId: "epic-ai",
      taskType: "task",
      title: "Add approval preview",
      description: "Let users select proposed tickets before applying them.",
      priority: "low",
      dueDate: null,
      acceptanceCriteria: ["Preview creates no task records.", "Only selected work is applied."]
    }
  ]
};

describe("AI task planner", () => {
  let app;
  let db;
  let planner;
  let owner;
  let project;

  beforeEach(async () => {
    planner = { preview: globalThis.vi.fn().mockResolvedValue(plan) };
    ({ app, db } = await buildTestApp({
      config: { aiPlannerEnabled: true },
      aiPlanner: planner
    }));
    owner = await registerUser(app, "ai-owner");
    const response = await request(app)
      .post("/api/projects")
      .set(auth(owner.token))
      .send({ key: "AIP", name: "AI Planner", description: "Provider-neutral delivery" });
    project = response.body.data;
  });

  afterEach(async () => db.end());

  it("returns a validated preview without persisting the API key or tasks", async () => {
    const response = await request(app)
      .post(`/api/projects/${project.id}/ai-plan/preview`)
      .set(auth(owner.token))
      .send({
        provider: "openai",
        apiKey: "request-scoped-secret-key",
        model: "test-model",
        goal: "Break the provider-neutral AI planner into safe delivery tasks.",
        context: "Preview before writing.",
        maxItems: 8
      });

    expect(response.status).toBe(200);
    expect(response.body.data.plan).toEqual(plan);
    expect(planner.preview).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "request-scoped-secret-key", provider: "openai" })
    );
    expect((await db.query("SELECT * FROM tasks")).rows).toHaveLength(0);
    expect(JSON.stringify((await db.query("SELECT * FROM activities")).rows)).not.toContain(
      "request-scoped-secret-key"
    );
  });

  it("atomically applies an approved hierarchy and its acceptance criteria", async () => {
    const response = await request(app)
      .post(`/api/projects/${project.id}/ai-plan/apply`)
      .set(auth(owner.token))
      .send({ plan });

    const tasks = await db.query(
      "SELECT id, issue_key, task_type, parent_task_id FROM tasks ORDER BY id"
    );
    const criteria = await db.query(
      "SELECT task_id, body, position FROM task_acceptance_criteria ORDER BY task_id, position"
    );
    expect(response.status).toBe(201);
    expect(response.body.data.created).toHaveLength(2);
    expect(tasks.rows).toHaveLength(2);
    expect(tasks.rows[1].parent_task_id).toBe(tasks.rows[0].id);
    expect(criteria.rows).toHaveLength(3);
  });

  it("denies preview access to project viewers", async () => {
    const viewer = await registerUser(app, "ai-viewer");
    await request(app)
      .post(`/api/projects/${project.id}/members`)
      .set(auth(owner.token))
      .send({ email: viewer.user.email, role: "viewer" });
    const response = await request(app)
      .post(`/api/projects/${project.id}/ai-plan/preview`)
      .set(auth(viewer.token))
      .send({
        provider: "google",
        apiKey: "request-scoped-secret-key",
        model: "test-model",
        goal: "Create a plan that a viewer must not be allowed to request.",
        maxItems: 5
      });

    expect(response.status).toBe(404);
    expect(planner.preview).not.toHaveBeenCalled();
  });

  it("blocks apply when the deployment feature flag is disabled", async () => {
    app.locals.config.aiPlannerEnabled = false;
    const response = await request(app)
      .post(`/api/projects/${project.id}/ai-plan/apply`)
      .set(auth(owner.token))
      .send({ plan });

    expect(response.status).toBe(503);
    expect((await db.query("SELECT * FROM tasks")).rows).toHaveLength(0);
  });
});
