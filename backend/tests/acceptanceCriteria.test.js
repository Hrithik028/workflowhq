const request = require("supertest");

const { auth, buildTestApp, registerUser } = require("./helpers/testApp");

const projectPayload = {
  key: "WHQ",
  name: "WorkflowHQ",
  description: "Build the developer workflow platform."
};

const taskPayload = (projectId = null) => ({
  title: "Verify GitHub webhook synchronization",
  description: "Confirm development events are attached to the correct ticket.",
  status: "todo",
  priority: "high",
  dueDate: "2026-09-15",
  projectId,
  taskType: "task",
  parentId: null,
  assigneeId: null
});

describe("task acceptance criteria", () => {
  let app;
  let db;
  let owner;

  beforeEach(async () => {
    ({ app, db } = await buildTestApp());
    owner = await registerUser(app, "criteria-owner");
  });

  afterEach(async () => {
    await db.end();
  });

  const createProject = () =>
    request(app).post("/api/projects").set(auth(owner.token)).send(projectPayload);
  const createTask = (projectId = null) =>
    request(app).post("/api/tasks").set(auth(owner.token)).send(taskPayload(projectId));

  it("creates, edits, completes, reorders, and deletes persisted criteria", async () => {
    const task = await createTask();
    const taskId = task.body.data.id;
    const first = await request(app)
      .post(`/api/tasks/${taskId}/criteria`)
      .set(auth(owner.token))
      .send({ body: "A matching push is recorded." });
    const second = await request(app)
      .post(`/api/tasks/${taskId}/criteria`)
      .set(auth(owner.token))
      .send({ body: "A matching pull request is linked." });

    const updated = await request(app)
      .put(`/api/tasks/${taskId}/criteria/${first.body.data.id}`)
      .set(auth(owner.token))
      .send({ body: "A matching push is recorded on the ticket.", completed: true });
    const reordered = await request(app)
      .put(`/api/tasks/${taskId}/criteria/order`)
      .set(auth(owner.token))
      .send({ criterionIds: [Number(second.body.data.id), Number(first.body.data.id)] });
    const removed = await request(app)
      .delete(`/api/tasks/${taskId}/criteria/${second.body.data.id}`)
      .set(auth(owner.token));
    const list = await request(app).get(`/api/tasks/${taskId}/criteria`).set(auth(owner.token));

    expect(first.status).toBe(201);
    expect(second.body.data.position).toBe(1);
    expect(updated.body.data).toMatchObject({
      body: "A matching push is recorded on the ticket.",
      completed: true
    });
    expect(reordered.status).toBe(200);
    expect(reordered.body.data.map((item) => Number(item.id))).toEqual([
      Number(second.body.data.id),
      Number(first.body.data.id)
    ]);
    expect(removed.status).toBe(204);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].completed).toBe(true);
  });

  it("lets viewers read criteria but requires an owner or editor to change them", async () => {
    const project = await createProject();
    const projectId = project.body.data.id;
    const viewer = await registerUser(app, "criteria-viewer");
    const editor = await registerUser(app, "criteria-editor");
    await request(app)
      .post(`/api/projects/${projectId}/members`)
      .set(auth(owner.token))
      .send({ email: viewer.user.email, role: "viewer" });
    await request(app)
      .post(`/api/projects/${projectId}/members`)
      .set(auth(owner.token))
      .send({ email: editor.user.email, role: "editor" });
    const task = await createTask(projectId);
    const taskId = task.body.data.id;

    const viewerRead = await request(app)
      .get(`/api/tasks/${taskId}/criteria`)
      .set(auth(viewer.token));
    const viewerWrite = await request(app)
      .post(`/api/tasks/${taskId}/criteria`)
      .set(auth(viewer.token))
      .send({ body: "Viewer must not add this." });
    const editorWrite = await request(app)
      .post(`/api/tasks/${taskId}/criteria`)
      .set(auth(editor.token))
      .send({ body: "Editor can add this." });

    expect(viewerRead.status).toBe(200);
    expect(viewerWrite.status).toBe(403);
    expect(viewerWrite.body.error.code).toBe("TASK_EDITOR_REQUIRED");
    expect(editorWrite.status).toBe(201);
  });

  it("conceals private inbox-task criteria from other users", async () => {
    const task = await createTask();
    const outsider = await registerUser(app, "criteria-outsider");
    const response = await request(app)
      .get(`/api/tasks/${task.body.data.id}/criteria`)
      .set(auth(outsider.token));

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("TASK_NOT_FOUND");
  });

  it("validates blank criteria and incomplete reorder payloads", async () => {
    const task = await createTask();
    const taskId = task.body.data.id;
    const blank = await request(app)
      .post(`/api/tasks/${taskId}/criteria`)
      .set(auth(owner.token))
      .send({ body: "   " });
    await request(app)
      .post(`/api/tasks/${taskId}/criteria`)
      .set(auth(owner.token))
      .send({ body: "First" });
    await request(app)
      .post(`/api/tasks/${taskId}/criteria`)
      .set(auth(owner.token))
      .send({ body: "Second" });
    const mismatch = await request(app)
      .put(`/api/tasks/${taskId}/criteria/order`)
      .set(auth(owner.token))
      .send({ criterionIds: [] });

    expect(blank.status).toBe(400);
    expect(mismatch.status).toBe(409);
    expect(mismatch.body.error.code).toBe("ACCEPTANCE_CRITERIA_ORDER_MISMATCH");
  });

  it("deletes criteria automatically when their task is deleted", async () => {
    const task = await createTask();
    const taskId = task.body.data.id;
    await request(app)
      .post(`/api/tasks/${taskId}/criteria`)
      .set(auth(owner.token))
      .send({ body: "This row should cascade." });

    await request(app).delete(`/api/tasks/${taskId}`).set(auth(owner.token));
    const rows = await db.query("SELECT * FROM task_acceptance_criteria WHERE task_id = $1", [
      taskId
    ]);

    expect(rows.rows).toHaveLength(0);
  });
});
