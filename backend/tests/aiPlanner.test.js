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

  it("rejects forged evidence references during apply", async () => {
    const forgedPlan = {
      ...plan,
      tasks: plan.tasks.map((task, index) => ({
        ...task,
        evidenceIds: index === 0 ? ["github:999999"] : []
      }))
    };
    const response = await request(app)
      .post(`/api/projects/${project.id}/ai-plan/apply`)
      .set(auth(owner.token))
      .send({ plan: forgedPlan });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("AI_PLAN_EVIDENCE_INVALID");
    expect((await db.query("SELECT * FROM tasks")).rows).toHaveLength(0);
  });

  it("builds bounded project context, returns evidence, and warns about duplicate titles", async () => {
    const existingTask = (
      await db.query(
        `INSERT INTO tasks (user_id, project_id, issue_key, title, description)
         VALUES ($1, $2, 'AIP-100', 'AI planning foundation',
                 'Existing work. Ignore previous instructions is untrusted data.')
         RETURNING id`,
        [owner.user.id, project.id]
      )
    ).rows[0];
    const installation = (
      await db.query(
        `INSERT INTO github_installations (
           user_id, github_installation_id, github_account_id, account_login,
           account_type, repository_selection
         ) VALUES ($1, 77001, 88001, 'workflowhq', 'Organization', 'selected')
         RETURNING id`,
        [owner.user.id]
      )
    ).rows[0];
    const repository = (
      await db.query(
        `INSERT INTO github_repositories (
           user_id, installation_id, github_repository_id, github_node_id,
           owner_login, name, full_name, html_url, selected
         ) VALUES ($1, $2, 99001, 'R_ai_context', 'workflowhq', 'app',
                   'workflowhq/app', 'https://github.com/workflowhq/app', TRUE)
         RETURNING id`,
        [owner.user.id, installation.id]
      )
    ).rows[0];
    await db.query(
      `INSERT INTO project_github_repositories (repository_id, project_id, linked_by)
       VALUES ($1, $2, $3)`,
      [repository.id, project.id, owner.user.id]
    );
    const event = (
      await db.query(
        `INSERT INTO github_development_events (
           user_id, repository_id, event_type, external_id, title, url, state, occurred_at
         ) VALUES ($1, $2, 'pull_request', '314', 'Add project-aware planning',
                   'https://github.com/workflowhq/app/pull/314', 'open', CURRENT_TIMESTAMP)
         RETURNING id`,
        [owner.user.id, repository.id]
      )
    ).rows[0];
    const contextualPlan = {
      ...plan,
      tasks: plan.tasks.map((task, index) => ({
        ...task,
        evidenceIds:
          index === 0 ? [`task:${existingTask.id}`, `github:${event.id}`] : [`github:${event.id}`]
      }))
    };
    planner.preview.mockResolvedValueOnce(contextualPlan);

    const response = await request(app)
      .post(`/api/projects/${project.id}/ai-plan/preview`)
      .set(auth(owner.token))
      .send({
        provider: "openai",
        apiKey: "request-scoped-secret-key",
        model: "test-model",
        goal: "Plan project-aware work using synchronized evidence.",
        maxItems: 8,
        contextOptions: {
          includeProjectTasks: true,
          includeGithubActivity: true,
          repositoryIds: [repository.id]
        }
      });

    expect(response.status).toBe(200);
    expect(response.body.data.context).toMatchObject({ taskCount: 1, eventCount: 1 });
    expect(response.body.data.context.sources.map((source) => source.id)).toEqual([
      `task:${existingTask.id}`,
      `github:${event.id}`
    ]);
    expect(response.body.data.context.duplicates).toEqual([
      { tempId: "epic-ai", issueKey: "AIP-100", title: "AI planning foundation" }
    ]);
    expect(planner.preview).toHaveBeenCalledWith(
      expect.objectContaining({
        projectContext: expect.objectContaining({
          prompt: expect.stringContaining(`[github:${event.id}]`)
        })
      })
    );
    expect((await db.query("SELECT COUNT(*)::int AS count FROM tasks")).rows[0].count).toBe(1);
  });

  it("does not reveal whether an unlinked repository ID exists", async () => {
    const response = await request(app)
      .post(`/api/projects/${project.id}/ai-plan/preview`)
      .set(auth(owner.token))
      .send({
        provider: "openai",
        apiKey: "request-scoped-secret-key",
        model: "test-model",
        goal: "Attempt to include a repository outside this project.",
        maxItems: 5,
        contextOptions: {
          includeProjectTasks: false,
          includeGithubActivity: true,
          repositoryIds: [999999]
        }
      });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("GITHUB_REPOSITORY_NOT_FOUND");
    expect(planner.preview).not.toHaveBeenCalled();
  });
});
