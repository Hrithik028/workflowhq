const request = require("supertest");

const { auth, buildTestApp, registerUser } = require("./helpers/testApp");

describe("in-app notifications", () => {
  let app;
  let db;
  let owner;
  let teammate;
  let outsider;
  let projectId;

  beforeEach(async () => {
    ({ app, db } = await buildTestApp());
    owner = await registerUser(app, "notice-owner");
    teammate = await registerUser(app, "notice-teammate");
    outsider = await registerUser(app, "notice-outsider");
    const project = await request(app)
      .post("/api/projects")
      .set(auth(owner.token))
      .send({ key: "NOTICE", name: "Notification test", description: "" });
    projectId = project.body.data.id;
  });

  afterEach(async () => {
    await db.end();
  });

  const list = (token, query = "") =>
    request(app).get(`/api/notifications${query}`).set(auth(token));

  it("notifies new members and assignees without exposing another user's alerts", async () => {
    const added = await request(app)
      .post(`/api/projects/${projectId}/members`)
      .set(auth(owner.token))
      .send({ email: teammate.user.email, role: "editor" });
    expect(added.status).toBe(202);

    const created = await request(app)
      .post("/api/tasks")
      .set(auth(owner.token))
      .send({ title: "Verify notifications", projectId, assigneeId: teammate.user.id });
    expect(created.status).toBe(201);
    const unchangedAssignee = await request(app)
      .put(`/api/tasks/${created.body.data.id}`)
      .set(auth(owner.token))
      .send({ title: "Verify notifications", projectId, assigneeId: teammate.user.id });
    expect(unchangedAssignee.status).toBe(200);

    const mine = await list(teammate.token);
    expect(mine.status).toBe(200);
    expect(mine.body.data.map((item) => item.kind)).toEqual(["task_assigned", "project_added"]);
    expect(mine.body.meta.unreadCount).toBe(2);
    const firstPage = await list(teammate.token, "?limit=1");
    expect(firstPage.body.data).toHaveLength(1);
    expect(firstPage.body.meta.hasMore).toBe(true);
    expect((await list(teammate.token, "?limit=1&offset=1")).body.data).toHaveLength(1);
    expect((await list(outsider.token)).body.data).toEqual([]);
    expect(
      (
        await request(app)
          .post(`/api/notifications/${mine.body.data[0].id}/read`)
          .set(auth(outsider.token))
      ).status
    ).toBe(404);

    const marked = await request(app)
      .post(`/api/notifications/${mine.body.data[0].id}/read`)
      .set(auth(teammate.token));
    expect(marked.status).toBe(200);
    expect((await list(teammate.token, "?unreadOnly=true")).body.data).toHaveLength(1);

    const cleared = await request(app)
      .post("/api/notifications/read-all")
      .set(auth(teammate.token));
    expect(cleared.body.data.updatedCount).toBe(1);
    expect((await list(teammate.token)).body.meta.unreadCount).toBe(0);
  });

  it("notifies the task owner about a teammate comment and hides alerts after access removal", async () => {
    await request(app)
      .post(`/api/projects/${projectId}/members`)
      .set(auth(owner.token))
      .send({ email: teammate.user.email, role: "viewer" });
    const created = await request(app)
      .post("/api/tasks")
      .set(auth(owner.token))
      .send({ title: "Discuss release", projectId });
    const commented = await request(app)
      .post(`/api/tasks/${created.body.data.id}/comments`)
      .set(auth(teammate.token))
      .send({ body: "Ready for review." });
    expect(commented.status).toBe(201);
    expect((await list(owner.token)).body.data[0].kind).toBe("task_commented");

    const removed = await request(app)
      .delete(`/api/projects/${projectId}/members/${teammate.user.id}`)
      .set(auth(owner.token));
    expect(removed.status).toBe(204);
    expect((await list(teammate.token)).body.data).toEqual([]);
  });
});
