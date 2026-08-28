const request = require("supertest");

const { auth, buildTestApp, registerUser } = require("./helpers/testApp");

const projectPayload = (overrides = {}) => ({
  key: "WHQ",
  name: "Launch workspace",
  description: "Coordinate the production release.",
  ...overrides
});

const taskPayload = (overrides = {}) => ({
  title: "Configure production environment",
  description: "Prepare environment variables and deployment settings.",
  status: "todo",
  priority: "high",
  dueDate: "2026-09-01",
  projectId: null,
  taskType: "task",
  parentId: null,
  assigneeId: null,
  sprintId: null,
  ...overrides
});

describe("sprints", () => {
  let app;
  let db;
  let owner;

  beforeEach(async () => {
    ({ app, db } = await buildTestApp());
    owner = await registerUser(app, "sprint-owner");
  });

  afterEach(async () => {
    await db.end();
  });

  const createProject = async (payload = projectPayload(), token = owner.token) =>
    request(app).post("/api/projects").set(auth(token)).send(payload);

  const addMember = async (projectId, body, token = owner.token) =>
    request(app).post(`/api/projects/${projectId}/members`).set(auth(token)).send(body);

  const createSprint = async (projectId, body, token = owner.token) =>
    request(app).post(`/api/projects/${projectId}/sprints`).set(auth(token)).send(body);

  const updateSprint = async (projectId, sprintId, body, token = owner.token) =>
    request(app)
      .put(`/api/projects/${projectId}/sprints/${sprintId}`)
      .set(auth(token))
      .send(body);

  it("creates a sprint and lists it on the project", async () => {
    const project = await createProject();
    const projectId = project.body.data.id;

    const created = await createSprint(projectId, {
      name: "Sprint 1",
      startDate: "2026-09-01",
      endDate: "2026-09-14"
    });
    const list = await request(app)
      .get(`/api/projects/${projectId}/sprints`)
      .set(auth(owner.token));

    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ name: "Sprint 1", status: "planned" });
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
  });

  it("blocks a viewer from creating, updating, or deleting sprints, but lets them list", async () => {
    const project = await createProject();
    const projectId = project.body.data.id;
    const viewer = await registerUser(app, "sprint-viewer");
    await addMember(projectId, { email: viewer.user.email, role: "viewer" });
    const sprint = await createSprint(projectId, { name: "Sprint 1" });

    const createAttempt = await createSprint(projectId, { name: "Blocked" }, viewer.token);
    const updateAttempt = await updateSprint(
      projectId,
      sprint.body.data.id,
      { name: "Renamed", status: "planned" },
      viewer.token
    );
    const deleteAttempt = await request(app)
      .delete(`/api/projects/${projectId}/sprints/${sprint.body.data.id}`)
      .set(auth(viewer.token));
    const listAttempt = await request(app)
      .get(`/api/projects/${projectId}/sprints`)
      .set(auth(viewer.token));

    expect(createAttempt.status).toBe(403);
    expect(updateAttempt.status).toBe(403);
    expect(deleteAttempt.status).toBe(403);
    expect(listAttempt.status).toBe(200);
  });

  it("only allows one active sprint per project at a time", async () => {
    const project = await createProject();
    const projectId = project.body.data.id;
    const first = await createSprint(projectId, { name: "Sprint 1" });
    const second = await createSprint(projectId, { name: "Sprint 2" });

    const activateFirst = await updateSprint(projectId, first.body.data.id, {
      name: "Sprint 1",
      status: "active"
    });
    const activateSecond = await updateSprint(projectId, second.body.data.id, {
      name: "Sprint 2",
      status: "active"
    });
    const completeFirst = await updateSprint(projectId, first.body.data.id, {
      name: "Sprint 1",
      status: "completed"
    });
    const activateSecondRetry = await updateSprint(projectId, second.body.data.id, {
      name: "Sprint 2",
      status: "active"
    });

    expect(activateFirst.status).toBe(200);
    expect(activateSecond.status).toBe(409);
    expect(activateSecond.body.error.code).toBe("SPRINT_ALREADY_ACTIVE");
    expect(completeFirst.status).toBe(200);
    expect(activateSecondRetry.status).toBe(200);
  });

  it("assigns a task to a sprint in the same project and returns the sprint name", async () => {
    const project = await createProject();
    const projectId = project.body.data.id;
    const sprint = await createSprint(projectId, { name: "Sprint 1" });

    const task = await request(app)
      .post("/api/tasks")
      .set(auth(owner.token))
      .send(taskPayload({ projectId, sprintId: sprint.body.data.id }));

    expect(task.status).toBe(201);
    expect(task.body.data.sprint_id).toBe(sprint.body.data.id);
    expect(task.body.data.sprint_name).toBe("Sprint 1");
  });

  it("rejects a sprint from a different project", async () => {
    const projectOne = await createProject(projectPayload({ key: "ONE", name: "One" }));
    const projectTwo = await createProject(projectPayload({ key: "TWO", name: "Two" }));
    const sprintInTwo = await createSprint(projectTwo.body.data.id, { name: "Sprint" });

    const response = await request(app)
      .post("/api/tasks")
      .set(auth(owner.token))
      .send(taskPayload({ projectId: projectOne.body.data.id, sprintId: sprintInTwo.body.data.id }));

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("SPRINT_NOT_IN_PROJECT");
  });

  it("rejects a sprint on an inbox task", async () => {
    const response = await request(app)
      .post("/api/tasks")
      .set(auth(owner.token))
      .send(taskPayload({ projectId: null, sprintId: 1 }));

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("SPRINT_NOT_IN_PROJECT");
  });
});
