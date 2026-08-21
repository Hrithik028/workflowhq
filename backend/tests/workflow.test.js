const request = require("supertest");

const { auth, buildTestApp, registerUser } = require("./helpers/testApp");

const taskPayload = (overrides = {}) => ({
  title: "Configure production environment",
  description: "Prepare environment variables and deployment settings.",
  status: "todo",
  priority: "high",
  dueDate: "2026-09-01",
  projectId: null,
  ...overrides
});

describe("projects, tasks, and activity API", () => {
  let app;
  let db;
  let first;

  beforeEach(async () => {
    ({ app, db } = await buildTestApp());
    first = await registerUser(app, "owner");
  });

  afterEach(async () => {
    await db.end();
  });

  const createProject = async (token = first.token, name = "Launch workspace") =>
    request(app)
      .post("/api/projects")
      .set(auth(token))
      .send({ name, description: "Coordinate the production release." });

  const createTask = async (payload = taskPayload(), token = first.token) =>
    request(app).post("/api/tasks").set(auth(token)).send(payload);

  it("creates, lists, updates, and deletes an owned project", async () => {
    const created = await createProject();
    const projectId = created.body.data.id;
    const listed = await request(app).get("/api/projects").set(auth(first.token));
    const updated = await request(app)
      .put(`/api/projects/${projectId}`)
      .set(auth(first.token))
      .send({ name: "Production launch", description: "Updated scope." });
    const deleted = await request(app).delete(`/api/projects/${projectId}`).set(auth(first.token));

    expect(created.status).toBe(201);
    expect(listed.body.data).toHaveLength(1);
    expect(updated.body.data.name).toBe("Production launch");
    expect(deleted.status).toBe(204);
  });

  it("creates, reads, updates, and deletes an owned task", async () => {
    const project = await createProject();
    const created = await createTask(taskPayload({ projectId: project.body.data.id }));
    const taskId = created.body.data.id;
    const read = await request(app).get(`/api/tasks/${taskId}`).set(auth(first.token));
    const updated = await request(app)
      .put(`/api/tasks/${taskId}`)
      .set(auth(first.token))
      .send(taskPayload({ projectId: project.body.data.id, status: "completed" }));
    const deleted = await request(app).delete(`/api/tasks/${taskId}`).set(auth(first.token));

    expect(created.status).toBe(201);
    expect(read.body.data.project_name).toBe("Launch workspace");
    expect(updated.body.data.status).toBe("completed");
    expect(deleted.status).toBe(204);
  });

  it("enforces task and project ownership for read, update, delete, and assignment", async () => {
    const project = await createProject();
    const task = await createTask(taskPayload({ projectId: project.body.data.id }));
    const second = await registerUser(app, "outsider");

    const readTask = await request(app)
      .get(`/api/tasks/${task.body.data.id}`)
      .set(auth(second.token));
    const updateTask = await request(app)
      .put(`/api/tasks/${task.body.data.id}`)
      .set(auth(second.token))
      .send(taskPayload());
    const deleteTask = await request(app)
      .delete(`/api/tasks/${task.body.data.id}`)
      .set(auth(second.token));
    const readProject = await request(app)
      .get(`/api/projects/${project.body.data.id}`)
      .set(auth(second.token));
    const assignProject = await createTask(
      taskPayload({ projectId: project.body.data.id }),
      second.token
    );

    expect(readTask.status).toBe(404);
    expect(updateTask.status).toBe(404);
    expect(deleteTask.status).toBe(404);
    expect(readProject.status).toBe(404);
    expect(assignProject.status).toBe(404);
  });

  it("filters, searches, sorts, and paginates bounded task results", async () => {
    await createTask(taskPayload({ title: "Deploy API", status: "in_progress", priority: "high" }));
    await createTask(
      taskPayload({ title: "Write release notes", status: "todo", priority: "low" })
    );
    await createTask(
      taskPayload({ title: "Run API smoke tests", status: "completed", priority: "medium" })
    );

    const filtered = await request(app)
      .get("/api/tasks?status=in_progress&priority=high")
      .set(auth(first.token));
    const searched = await request(app)
      .get("/api/tasks?search=API&sort=title&order=asc&page=1&limit=1")
      .set(auth(first.token));

    expect(filtered.status).toBe(200);
    expect(filtered.body.data.map((task) => task.title)).toEqual(["Deploy API"]);
    expect(searched.body.data).toHaveLength(1);
    expect(searched.body.pagination).toEqual({ page: 1, limit: 1, total: 2, pages: 2 });
  });

  it("returns useful task statistics including overdue work", async () => {
    await createTask(taskPayload({ title: "Overdue task", dueDate: "2020-01-01" }));
    await createTask(
      taskPayload({ title: "Completed task", status: "completed", priority: "low" })
    );
    const response = await request(app).get("/api/tasks/stats").set(auth(first.token));

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      total_tasks: 2,
      completed_tasks: 1,
      todo_tasks: 1,
      high_priority_tasks: 1,
      overdue_tasks: 1
    });
  });

  it.each([
    ["invalid status", taskPayload({ status: "blocked" })],
    ["invalid priority", taskPayload({ priority: "urgent" })],
    ["missing title", taskPayload({ title: "" })]
  ])("rejects %s", async (_name, payload) => {
    const response = await createTask(payload);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects malformed identifiers and unbounded pagination", async () => {
    const malformed = await request(app).get("/api/tasks/not-a-number").set(auth(first.token));
    const unbounded = await request(app).get("/api/tasks?limit=101").set(auth(first.token));

    expect(malformed.status).toBe(400);
    expect(unbounded.status).toBe(400);
  });

  it("returns only the authenticated user's activity", async () => {
    await createTask();
    const second = await registerUser(app, "activity-outsider");
    await createTask(taskPayload({ title: "Private outsider task" }), second.token);

    const response = await request(app).get("/api/activity").set(auth(first.token));
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].entity_title).toBe("Configure production environment");
  });
});
