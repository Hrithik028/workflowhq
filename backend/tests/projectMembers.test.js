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

describe("project membership and roles", () => {
  let app;
  let db;
  let owner;

  beforeEach(async () => {
    ({ app, db } = await buildTestApp());
    owner = await registerUser(app, "member-owner");
  });

  afterEach(async () => {
    await db.end();
  });

  const createProject = async (payload = projectPayload(), token = owner.token) =>
    request(app).post("/api/projects").set(auth(token)).send(payload);

  const addMember = async (projectId, body, token = owner.token) =>
    request(app).post(`/api/projects/${projectId}/members`).set(auth(token)).send(body);

  it("automatically makes the creator the project's owner", async () => {
    const project = await createProject();
    const members = await request(app)
      .get(`/api/projects/${project.body.data.id}/members`)
      .set(auth(owner.token));

    expect(project.status).toBe(201);
    expect(project.body.data.my_role).toBe("owner");
    expect(members.status).toBe(200);
    expect(members.body.data).toHaveLength(1);
    expect(members.body.data[0]).toMatchObject({ userId: owner.user.id, role: "owner" });
  });

  it("hides a project from a non-member and reveals it once added", async () => {
    const project = await createProject();
    const projectId = project.body.data.id;
    const second = await registerUser(app, "member-second");

    const before = await request(app).get(`/api/projects/${projectId}`).set(auth(second.token));
    const membersBefore = await request(app)
      .get(`/api/projects/${projectId}/members`)
      .set(auth(second.token));
    const added = await addMember(projectId, { email: second.user.email, role: "editor" });
    const after = await request(app).get(`/api/projects/${projectId}`).set(auth(second.token));

    expect(before.status).toBe(404);
    expect(membersBefore.status).toBe(404);
    expect(added.status).toBe(201);
    expect(added.body.data).toMatchObject({ email: second.user.email, role: "editor" });
    expect(after.status).toBe(200);
    expect(after.body.data.my_role).toBe("editor");
  });

  it("blocks a viewer from creating or editing tasks in the project", async () => {
    const project = await createProject();
    const projectId = project.body.data.id;
    const task = await request(app)
      .post("/api/tasks")
      .set(auth(owner.token))
      .send(taskPayload({ projectId }));
    const viewer = await registerUser(app, "member-viewer");
    await addMember(projectId, { email: viewer.user.email, role: "viewer" });

    const createAttempt = await request(app)
      .post("/api/tasks")
      .set(auth(viewer.token))
      .send(taskPayload({ projectId, title: "Viewer cannot create this" }));
    const editAttempt = await request(app)
      .put(`/api/tasks/${task.body.data.id}`)
      .set(auth(viewer.token))
      .send(taskPayload({ projectId, title: "Viewer cannot edit this" }));
    const readAttempt = await request(app)
      .get(`/api/tasks/${task.body.data.id}`)
      .set(auth(viewer.token));

    expect([403, 404]).toContain(createAttempt.status);
    expect([403, 404]).toContain(editAttempt.status);
    expect(readAttempt.status).toBe(200);
  });

  it("requires the assignee to be a project member", async () => {
    const project = await createProject();
    const projectId = project.body.data.id;
    const outsider = await registerUser(app, "member-outsider-assignee");
    const editor = await registerUser(app, "member-editor-assignee");
    await addMember(projectId, { email: editor.user.email, role: "editor" });

    const invalid = await request(app)
      .post("/api/tasks")
      .set(auth(owner.token))
      .send(taskPayload({ projectId, assigneeId: outsider.user.id }));
    const valid = await request(app)
      .post("/api/tasks")
      .set(auth(owner.token))
      .send(taskPayload({ projectId, title: "Assigned to editor", assigneeId: editor.user.id }));

    expect(invalid.status).toBe(422);
    expect(invalid.body.error.code).toBe("ASSIGNEE_NOT_A_MEMBER");
    expect(valid.status).toBe(201);
    expect(valid.body.data.assignee_id).toBe(editor.user.id);
    expect(valid.body.data.assignee_email).toBe(editor.user.email);
  });

  it("rejects an assignee on an inbox task", async () => {
    const other = await registerUser(app, "member-inbox-assignee");
    const response = await request(app)
      .post("/api/tasks")
      .set(auth(owner.token))
      .send(taskPayload({ projectId: null, assigneeId: other.user.id }));

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("ASSIGNEE_NOT_A_MEMBER");
  });

  it("keeps a subtask's parent link and project name across different creators", async () => {
    const project = await createProject();
    const projectId = project.body.data.id;
    const editor = await registerUser(app, "member-hierarchy-editor");
    await addMember(projectId, { email: editor.user.email, role: "editor" });

    const parent = await request(app)
      .post("/api/tasks")
      .set(auth(owner.token))
      .send(taskPayload({ projectId, taskType: "epic", title: "Owner's epic" }));
    const child = await request(app)
      .post("/api/tasks")
      .set(auth(editor.token))
      .send(
        taskPayload({
          projectId,
          taskType: "story",
          parentId: parent.body.data.id,
          title: "Editor's story"
        })
      );

    expect(child.status).toBe(201);
    expect(child.body.data.project_name).toBe(project.body.data.name);
    expect(child.body.data.parent_title).toBe("Owner's epic");
    expect(child.body.data.child_count).toBe(0);

    const parentRead = await request(app)
      .get(`/api/tasks/${parent.body.data.id}`)
      .set(auth(owner.token));
    expect(parentRead.body.data.child_count).toBe(1);
  });

  it("blocks demoting or removing the last remaining owner", async () => {
    const project = await createProject();
    const projectId = project.body.data.id;

    const demoteSelf = await request(app)
      .patch(`/api/projects/${projectId}/members/${owner.user.id}`)
      .set(auth(owner.token))
      .send({ role: "editor" });
    const removeSelf = await request(app)
      .delete(`/api/projects/${projectId}/members/${owner.user.id}`)
      .set(auth(owner.token));

    expect(demoteSelf.status).toBe(409);
    expect(demoteSelf.body.error.code).toBe("LAST_OWNER_REQUIRED");
    expect(removeSelf.status).toBe(409);
    expect(removeSelf.body.error.code).toBe("LAST_OWNER_REQUIRED");

    const coOwner = await registerUser(app, "member-co-owner");
    await addMember(projectId, { email: coOwner.user.email, role: "editor" });
    const promote = await request(app)
      .patch(`/api/projects/${projectId}/members/${coOwner.user.id}`)
      .set(auth(owner.token))
      .send({ role: "owner" });
    const demoteNowAllowed = await request(app)
      .patch(`/api/projects/${projectId}/members/${owner.user.id}`)
      .set(auth(coOwner.token))
      .send({ role: "editor" });

    expect(promote.status).toBe(200);
    expect(demoteNowAllowed.status).toBe(200);
  });

  it("looks up new members by exact email match only", async () => {
    const project = await createProject();
    const projectId = project.body.data.id;
    const editor = await registerUser(app, "member-exact-email");

    const notFound = await addMember(projectId, { email: "nobody@example.com", role: "editor" });
    const added = await addMember(projectId, { email: editor.user.email, role: "editor" });
    const duplicate = await addMember(projectId, { email: editor.user.email, role: "viewer" });

    expect(notFound.status).toBe(404);
    expect(notFound.body.error.code).toBe("USER_NOT_FOUND");
    expect(added.status).toBe(201);
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe("PROJECT_MEMBER_EXISTS");
  });

  it("only an owner can add members, and a non-owner is refused", async () => {
    const project = await createProject();
    const projectId = project.body.data.id;
    const editor = await registerUser(app, "member-non-owner-adder");
    const target = await registerUser(app, "member-non-owner-target");
    await addMember(projectId, { email: editor.user.email, role: "editor" });

    const response = await addMember(
      projectId,
      { email: target.user.email, role: "viewer" },
      editor.token
    );

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("PROJECT_OWNER_REQUIRED");
  });
});
