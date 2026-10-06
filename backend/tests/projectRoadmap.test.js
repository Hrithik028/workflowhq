const request = require("supertest");

const { auth, buildTestApp, registerUser } = require("./helpers/testApp");

describe("project roadmap dependencies", () => {
  let app;
  let db;
  let owner;
  let projectId;
  let taskIds;

  beforeEach(async () => {
    ({ app, db } = await buildTestApp());
    owner = await registerUser(app, "roadmap-owner");
    const project = await request(app)
      .post("/api/projects")
      .set(auth(owner.token))
      .send({ key: "ROAD", name: "Roadmap", description: "" });
    projectId = project.body.data.id;
    taskIds = [];
    for (const title of ["Design", "Build", "Ship"]) {
      const task = await request(app)
        .post("/api/tasks")
        .set(auth(owner.token))
        .send({ title, projectId });
      taskIds.push(task.body.data.id);
    }
  });

  afterEach(async () => {
    await db.end();
  });

  it("lists project tickets and prevents cycles and duplicates", async () => {
    const [design, build, ship] = taskIds;
    for (const [blockerTaskId, blockedTaskId] of [
      [design, build],
      [build, ship]
    ]) {
      const response = await request(app)
        .post(`/api/projects/${projectId}/dependencies`)
        .set(auth(owner.token))
        .send({ blockerTaskId, blockedTaskId });
      expect(response.status).toBe(201);
    }
    const roadmap = await request(app)
      .get(`/api/projects/${projectId}/roadmap`)
      .set(auth(owner.token));
    expect(roadmap.status).toBe(200);
    expect(roadmap.body.data.tasks).toHaveLength(3);
    expect(roadmap.body.data.dependencies).toHaveLength(2);

    const cycle = await request(app)
      .post(`/api/projects/${projectId}/dependencies`)
      .set(auth(owner.token))
      .send({ blockerTaskId: ship, blockedTaskId: design });
    expect(cycle.status).toBe(409);
    expect(cycle.body.error.code).toBe("DEPENDENCY_CYCLE");

    const duplicate = await request(app)
      .post(`/api/projects/${projectId}/dependencies`)
      .set(auth(owner.token))
      .send({ blockerTaskId: design, blockedTaskId: build });
    expect(duplicate.status).toBe(409);
  });

  it("rejects outsiders and cross-project tickets", async () => {
    const outsider = await registerUser(app, "roadmap-outsider");
    const denied = await request(app)
      .get(`/api/projects/${projectId}/roadmap`)
      .set(auth(outsider.token));
    expect(denied.status).toBe(404);

    await request(app)
      .post(`/api/projects/${projectId}/members`)
      .set(auth(owner.token))
      .send({ email: outsider.user.email, role: "viewer" });
    const viewerRead = await request(app)
      .get(`/api/projects/${projectId}/roadmap`)
      .set(auth(outsider.token));
    expect(viewerRead.status).toBe(200);
    const viewerWrite = await request(app)
      .post(`/api/projects/${projectId}/dependencies`)
      .set(auth(outsider.token))
      .send({ blockerTaskId: taskIds[0], blockedTaskId: taskIds[1] });
    expect(viewerWrite.status).toBe(403);

    const otherProject = await request(app)
      .post("/api/projects")
      .set(auth(owner.token))
      .send({ key: "OTHER", name: "Other", description: "" });
    const otherTask = await request(app)
      .post("/api/tasks")
      .set(auth(owner.token))
      .send({ title: "Elsewhere", projectId: otherProject.body.data.id });
    const crossProject = await request(app)
      .post(`/api/projects/${projectId}/dependencies`)
      .set(auth(owner.token))
      .send({ blockerTaskId: taskIds[0], blockedTaskId: otherTask.body.data.id });
    expect(crossProject.status).toBe(422);
  });

  it("removes a dependency without deleting either ticket", async () => {
    const [blockerTaskId, blockedTaskId] = taskIds;
    await request(app)
      .post(`/api/projects/${projectId}/dependencies`)
      .set(auth(owner.token))
      .send({ blockerTaskId, blockedTaskId });
    const removed = await request(app)
      .delete(`/api/projects/${projectId}/dependencies/${blockerTaskId}/${blockedTaskId}`)
      .set(auth(owner.token));
    expect(removed.status).toBe(204);
    const roadmap = await request(app)
      .get(`/api/projects/${projectId}/roadmap`)
      .set(auth(owner.token));
    expect(roadmap.body.data.tasks).toHaveLength(3);
    expect(roadmap.body.data.dependencies).toHaveLength(0);
  });

  it("does not allow a linked ticket to leave its project", async () => {
    const [blockerTaskId, blockedTaskId] = taskIds;
    await request(app)
      .post(`/api/projects/${projectId}/dependencies`)
      .set(auth(owner.token))
      .send({ blockerTaskId, blockedTaskId });
    const otherProject = await request(app)
      .post("/api/projects")
      .set(auth(owner.token))
      .send({ key: "NEXT", name: "Next", description: "" });
    const moved = await request(app)
      .put(`/api/tasks/${blockedTaskId}`)
      .set(auth(owner.token))
      .send({ title: "Build", projectId: otherProject.body.data.id });
    expect(moved.status).toBe(409);
    expect(moved.body.error.code).toBe("TASK_HAS_DEPENDENCIES");
  });
});
