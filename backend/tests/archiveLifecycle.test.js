const request = require("supertest");

const { auth, buildTestApp, registerUser } = require("./helpers/testApp");

const projectPayload = {
  key: "LIFE",
  name: "Lifecycle project",
  description: "Verify retained project history."
};

const taskPayload = (projectId, overrides = {}) => ({
  projectId,
  title: "Retain this ticket",
  description: "Keep its project and development context.",
  status: "todo",
  priority: "medium",
  startDate: null,
  dueDate: null,
  taskType: "task",
  parentId: null,
  assigneeId: null,
  sprintId: null,
  ...overrides
});

describe("archive lifecycle", () => {
  let app;
  let db;
  let owner;

  beforeEach(async () => {
    ({ app, db } = await buildTestApp());
    owner = await registerUser(app, "archive-owner");
  });

  afterEach(async () => {
    await db.end();
  });

  const createProject = async () =>
    request(app).post("/api/projects").set(auth(owner.token)).send(projectPayload);

  const createTask = async (projectId, overrides) =>
    request(app).post("/api/tasks").set(auth(owner.token)).send(taskPayload(projectId, overrides));

  it("archives and restores a project without detaching its tickets", async () => {
    const project = await createProject();
    const projectId = project.body.data.id;
    const task = await createTask(projectId);

    const archived = await request(app)
      .post(`/api/projects/${projectId}/archive`)
      .set(auth(owner.token));
    const activeProjects = await request(app).get("/api/projects").set(auth(owner.token));
    const archivedProjects = await request(app)
      .get("/api/projects?archived=true")
      .set(auth(owner.token));
    const activeTasks = await request(app).get("/api/tasks?limit=100").set(auth(owner.token));
    const storedTask = await db.query("SELECT project_id FROM tasks WHERE id = $1", [
      task.body.data.id
    ]);

    expect(archived.status).toBe(200);
    expect(archived.body.data.archived_at).toBeTruthy();
    expect(activeProjects.body.data).toHaveLength(0);
    expect(archivedProjects.body.data).toHaveLength(1);
    expect(activeTasks.body.data).toHaveLength(0);
    expect(Number(storedTask.rows[0].project_id)).toBe(projectId);

    const restored = await request(app)
      .post(`/api/projects/${projectId}/restore`)
      .set(auth(owner.token));
    const restoredTasks = await request(app).get("/api/tasks?limit=100").set(auth(owner.token));

    expect(restored.status).toBe(200);
    expect(restored.body.data.archived_at).toBeNull();
    expect(restoredTasks.body.data.map((item) => item.id)).toContain(task.body.data.id);
  });

  it("blocks permanent project deletion while any ticket remains", async () => {
    const project = await createProject();
    const projectId = project.body.data.id;
    const task = await createTask(projectId);

    await request(app).post(`/api/projects/${projectId}/archive`).set(auth(owner.token));
    const deleted = await request(app).delete(`/api/projects/${projectId}`).set(auth(owner.token));
    const storedTask = await db.query("SELECT project_id FROM tasks WHERE id = $1", [
      task.body.data.id
    ]);

    expect(deleted.status).toBe(409);
    expect(deleted.body.error.code).toBe("PROJECT_NOT_EMPTY");
    expect(Number(storedTask.rows[0].project_id)).toBe(projectId);
  });

  it("archives individual tickets, hides them from active statistics, and restores them", async () => {
    const project = await createProject();
    const task = await createTask(project.body.data.id);
    const taskId = task.body.data.id;

    const archived = await request(app).post(`/api/tasks/${taskId}/archive`).set(auth(owner.token));
    const activeTasks = await request(app).get("/api/tasks?limit=100").set(auth(owner.token));
    const archivedTasks = await request(app)
      .get("/api/tasks?archived=true&limit=100")
      .set(auth(owner.token));
    const stats = await request(app).get("/api/tasks/stats").set(auth(owner.token));

    expect(archived.status).toBe(200);
    expect(archived.body.data.archived_at).toBeTruthy();
    expect(activeTasks.body.data).toHaveLength(0);
    expect(archivedTasks.body.data.map((item) => item.id)).toContain(taskId);
    expect(stats.body.data.total_tasks).toBe(0);

    const restored = await request(app).post(`/api/tasks/${taskId}/restore`).set(auth(owner.token));
    const activeAgain = await request(app).get("/api/tasks?limit=100").set(auth(owner.token));

    expect(restored.status).toBe(200);
    expect(restored.body.data.archived_at).toBeNull();
    expect(activeAgain.body.data.map((item) => item.id)).toContain(taskId);
  });

  it("requires active children to be archived before their parent", async () => {
    const project = await createProject();
    const parent = await createTask(project.body.data.id, {
      title: "Parent epic",
      taskType: "epic"
    });
    const child = await createTask(project.body.data.id, {
      title: "Child task",
      parentId: parent.body.data.id
    });

    const blocked = await request(app)
      .post(`/api/tasks/${parent.body.data.id}/archive`)
      .set(auth(owner.token));
    await request(app).post(`/api/tasks/${child.body.data.id}/archive`).set(auth(owner.token));
    const archivedParent = await request(app)
      .post(`/api/tasks/${parent.body.data.id}/archive`)
      .set(auth(owner.token));

    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("TASK_HAS_ACTIVE_CHILDREN");
    expect(archivedParent.status).toBe(200);
  });

  it("does not let a viewer archive project work", async () => {
    const project = await createProject();
    const task = await createTask(project.body.data.id);
    const viewer = await registerUser(app, "archive-viewer");
    await request(app)
      .post(`/api/projects/${project.body.data.id}/members`)
      .set(auth(owner.token))
      .send({ email: viewer.user.email, role: "viewer" });

    const response = await request(app)
      .post(`/api/tasks/${task.body.data.id}/archive`)
      .set(auth(viewer.token));

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("PROJECT_NOT_FOUND");
  });
});
