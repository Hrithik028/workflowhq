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
  ...overrides
});

describe("labels", () => {
  let app;
  let db;
  let owner;

  beforeEach(async () => {
    ({ app, db } = await buildTestApp());
    owner = await registerUser(app, "label-owner");
  });

  afterEach(async () => {
    await db.end();
  });

  const createProject = async (payload = projectPayload(), token = owner.token) =>
    request(app).post("/api/projects").set(auth(token)).send(payload);

  const addMember = async (projectId, body, token = owner.token) =>
    request(app).post(`/api/projects/${projectId}/members`).set(auth(token)).send(body);

  const createLabel = async (projectId, body, token = owner.token) =>
    request(app).post(`/api/projects/${projectId}/labels`).set(auth(token)).send(body);

  it("creates a label and lists it on the project", async () => {
    const project = await createProject();
    const projectId = project.body.data.id;

    const created = await createLabel(projectId, { name: "Bug", color: "#FF0000" });
    const list = await request(app)
      .get(`/api/projects/${projectId}/labels`)
      .set(auth(owner.token));

    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ name: "Bug", color: "#ff0000" });
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
  });

  it("rejects a duplicate label name on the same project", async () => {
    const project = await createProject();
    const projectId = project.body.data.id;
    await createLabel(projectId, { name: "Bug", color: "#ff0000" });

    const duplicate = await createLabel(projectId, { name: "Bug", color: "#00ff00" });

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe("LABEL_EXISTS");
  });

  it("rejects a malformed color", async () => {
    const project = await createProject();
    const projectId = project.body.data.id;

    const response = await createLabel(projectId, { name: "Bug", color: "red" });

    expect(response.status).toBe(400);
  });

  it("blocks a viewer from creating, updating, or deleting labels", async () => {
    const project = await createProject();
    const projectId = project.body.data.id;
    const viewer = await registerUser(app, "label-viewer");
    await addMember(projectId, { email: viewer.user.email, role: "viewer" });
    const label = await createLabel(projectId, { name: "Bug", color: "#ff0000" });

    const createAttempt = await createLabel(
      projectId,
      { name: "Blocked", color: "#123456" },
      viewer.token
    );
    const updateAttempt = await request(app)
      .put(`/api/projects/${projectId}/labels/${label.body.data.id}`)
      .set(auth(viewer.token))
      .send({ name: "Renamed", color: "#654321" });
    const deleteAttempt = await request(app)
      .delete(`/api/projects/${projectId}/labels/${label.body.data.id}`)
      .set(auth(viewer.token));

    expect(createAttempt.status).toBe(403);
    expect(createAttempt.body.error.code).toBe("PROJECT_EDITOR_REQUIRED");
    expect(updateAttempt.status).toBe(403);
    expect(deleteAttempt.status).toBe(403);
  });

  it("hides project labels from a non-member", async () => {
    const project = await createProject();
    const projectId = project.body.data.id;
    const outsider = await registerUser(app, "label-outsider");

    const response = await request(app)
      .get(`/api/projects/${projectId}/labels`)
      .set(auth(outsider.token));

    expect(response.status).toBe(404);
  });

  it("attaches and detaches a label on a task, and returns it embedded on the task", async () => {
    const project = await createProject();
    const projectId = project.body.data.id;
    const label = await createLabel(projectId, { name: "Urgent", color: "#ff5500" });
    const task = await request(app)
      .post("/api/tasks")
      .set(auth(owner.token))
      .send(taskPayload({ projectId }));

    const attached = await request(app)
      .post(`/api/tasks/${task.body.data.id}/labels`)
      .set(auth(owner.token))
      .send({ labelId: label.body.data.id });
    const afterAttach = await request(app)
      .get(`/api/tasks/${task.body.data.id}`)
      .set(auth(owner.token));
    const detached = await request(app)
      .delete(`/api/tasks/${task.body.data.id}/labels/${label.body.data.id}`)
      .set(auth(owner.token));
    const afterDetach = await request(app)
      .get(`/api/tasks/${task.body.data.id}`)
      .set(auth(owner.token));

    expect(attached.status).toBe(204);
    expect(afterAttach.body.data.labels).toHaveLength(1);
    expect(afterAttach.body.data.labels[0]).toMatchObject({
      id: label.body.data.id,
      name: "Urgent",
      color: "#ff5500"
    });
    expect(detached.status).toBe(204);
    expect(afterDetach.body.data.labels).toEqual([]);
  });

  it("attaching the same label twice does not duplicate it on the task", async () => {
    const project = await createProject();
    const projectId = project.body.data.id;
    const label = await createLabel(projectId, { name: "Repeat", color: "#112233" });
    const task = await request(app)
      .post("/api/tasks")
      .set(auth(owner.token))
      .send(taskPayload({ projectId }));

    await request(app)
      .post(`/api/tasks/${task.body.data.id}/labels`)
      .set(auth(owner.token))
      .send({ labelId: label.body.data.id });
    await request(app)
      .post(`/api/tasks/${task.body.data.id}/labels`)
      .set(auth(owner.token))
      .send({ labelId: label.body.data.id });
    const afterAttach = await request(app)
      .get(`/api/tasks/${task.body.data.id}`)
      .set(auth(owner.token));

    expect(afterAttach.body.data.labels).toHaveLength(1);
  });

  it("rejects attaching a label from a different project", async () => {
    const projectOne = await createProject(projectPayload({ key: "ONE", name: "One" }));
    const projectTwo = await createProject(projectPayload({ key: "TWO", name: "Two" }));
    const label = await createLabel(projectTwo.body.data.id, { name: "Other", color: "#abcdef" });
    const task = await request(app)
      .post("/api/tasks")
      .set(auth(owner.token))
      .send(taskPayload({ projectId: projectOne.body.data.id }));

    const response = await request(app)
      .post(`/api/tasks/${task.body.data.id}/labels`)
      .set(auth(owner.token))
      .send({ labelId: label.body.data.id });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("LABEL_NOT_FOUND");
  });

  it("rejects attaching a label to an inbox task", async () => {
    const task = await request(app)
      .post("/api/tasks")
      .set(auth(owner.token))
      .send(taskPayload({ projectId: null }));

    const response = await request(app)
      .post(`/api/tasks/${task.body.data.id}/labels`)
      .set(auth(owner.token))
      .send({ labelId: 1 });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("TASK_NOT_IN_PROJECT");
  });

  it("deleting a label removes it from any tasks it was attached to", async () => {
    const project = await createProject();
    const projectId = project.body.data.id;
    const label = await createLabel(projectId, { name: "Removable", color: "#334455" });
    const task = await request(app)
      .post("/api/tasks")
      .set(auth(owner.token))
      .send(taskPayload({ projectId }));
    await request(app)
      .post(`/api/tasks/${task.body.data.id}/labels`)
      .set(auth(owner.token))
      .send({ labelId: label.body.data.id });

    const deleted = await request(app)
      .delete(`/api/projects/${projectId}/labels/${label.body.data.id}`)
      .set(auth(owner.token));
    const afterDelete = await request(app)
      .get(`/api/tasks/${task.body.data.id}`)
      .set(auth(owner.token));

    expect(deleted.status).toBe(204);
    expect(afterDelete.body.data.labels).toEqual([]);
  });
});
