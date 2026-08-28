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

describe("comments", () => {
  let app;
  let db;
  let owner;

  beforeEach(async () => {
    ({ app, db } = await buildTestApp());
    owner = await registerUser(app, "comment-owner");
  });

  afterEach(async () => {
    await db.end();
  });

  const createProject = async (payload = projectPayload(), token = owner.token) =>
    request(app).post("/api/projects").set(auth(token)).send(payload);

  const addMember = async (projectId, body, token = owner.token) =>
    request(app).post(`/api/projects/${projectId}/members`).set(auth(token)).send(body);

  const createTask = async (payload, token = owner.token) =>
    request(app).post("/api/tasks").set(auth(token)).send(payload);

  it("posts a comment and lists it with the author's name and email", async () => {
    const task = await createTask(taskPayload());

    const posted = await request(app)
      .post(`/api/tasks/${task.body.data.id}/comments`)
      .set(auth(owner.token))
      .send({ body: "Looks good to me." });
    const list = await request(app)
      .get(`/api/tasks/${task.body.data.id}/comments`)
      .set(auth(owner.token));

    expect(posted.status).toBe(201);
    expect(posted.body.data).toMatchObject({
      body: "Looks good to me.",
      author_name: owner.user.name,
      author_email: owner.user.email
    });
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
  });

  it("lets a viewer comment on a task they can only view", async () => {
    const project = await createProject();
    const projectId = project.body.data.id;
    const viewer = await registerUser(app, "comment-viewer");
    await addMember(projectId, { email: viewer.user.email, role: "viewer" });
    const task = await createTask(taskPayload({ projectId }));

    const posted = await request(app)
      .post(`/api/tasks/${task.body.data.id}/comments`)
      .set(auth(viewer.token))
      .send({ body: "A viewer can still weigh in." });

    expect(posted.status).toBe(201);
  });

  it("blocks a non-member from reading or posting comments", async () => {
    const task = await createTask(taskPayload());
    const outsider = await registerUser(app, "comment-outsider");

    const posted = await request(app)
      .post(`/api/tasks/${task.body.data.id}/comments`)
      .set(auth(outsider.token))
      .send({ body: "Should not work." });
    const list = await request(app)
      .get(`/api/tasks/${task.body.data.id}/comments`)
      .set(auth(outsider.token));

    expect(posted.status).toBe(404);
    expect(list.status).toBe(404);
  });

  it("only lets the author edit their own comment", async () => {
    const project = await createProject();
    const projectId = project.body.data.id;
    const editor = await registerUser(app, "comment-editor");
    await addMember(projectId, { email: editor.user.email, role: "editor" });
    const task = await createTask(taskPayload({ projectId }));
    const posted = await request(app)
      .post(`/api/tasks/${task.body.data.id}/comments`)
      .set(auth(owner.token))
      .send({ body: "Original text." });

    const otherEdit = await request(app)
      .put(`/api/tasks/${task.body.data.id}/comments/${posted.body.data.id}`)
      .set(auth(editor.token))
      .send({ body: "Hijacked." });
    const authorEdit = await request(app)
      .put(`/api/tasks/${task.body.data.id}/comments/${posted.body.data.id}`)
      .set(auth(owner.token))
      .send({ body: "Edited by the author." });

    expect(otherEdit.status).toBe(403);
    expect(otherEdit.body.error.code).toBe("COMMENT_AUTHOR_REQUIRED");
    expect(authorEdit.status).toBe(200);
    expect(authorEdit.body.data.body).toBe("Edited by the author.");
  });

  it("lets the author or a project editor delete a comment, but not a viewer", async () => {
    const project = await createProject();
    const projectId = project.body.data.id;
    const editor = await registerUser(app, "comment-delete-editor");
    const viewer = await registerUser(app, "comment-delete-viewer");
    await addMember(projectId, { email: editor.user.email, role: "editor" });
    await addMember(projectId, { email: viewer.user.email, role: "viewer" });
    const task = await createTask(taskPayload({ projectId }));
    const first = await request(app)
      .post(`/api/tasks/${task.body.data.id}/comments`)
      .set(auth(owner.token))
      .send({ body: "First comment." });
    const second = await request(app)
      .post(`/api/tasks/${task.body.data.id}/comments`)
      .set(auth(owner.token))
      .send({ body: "Second comment." });

    const viewerDelete = await request(app)
      .delete(`/api/tasks/${task.body.data.id}/comments/${first.body.data.id}`)
      .set(auth(viewer.token));
    const editorDelete = await request(app)
      .delete(`/api/tasks/${task.body.data.id}/comments/${first.body.data.id}`)
      .set(auth(editor.token));
    const authorDelete = await request(app)
      .delete(`/api/tasks/${task.body.data.id}/comments/${second.body.data.id}`)
      .set(auth(owner.token));
    const list = await request(app)
      .get(`/api/tasks/${task.body.data.id}/comments`)
      .set(auth(owner.token));

    expect(viewerDelete.status).toBe(403);
    expect(editorDelete.status).toBe(204);
    expect(authorDelete.status).toBe(204);
    expect(list.body.data).toHaveLength(0);
  });

  it("logs an activity entry when a comment is posted", async () => {
    const task = await createTask(taskPayload());
    await request(app)
      .post(`/api/tasks/${task.body.data.id}/comments`)
      .set(auth(owner.token))
      .send({ body: "Noted." });

    const activity = await request(app).get("/api/activity").set(auth(owner.token));

    expect(activity.body.data.some((entry) => entry.action === "task_comment_added")).toBe(true);
  });
});
