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

describe("task ranking", () => {
  let app;
  let db;
  let owner;

  beforeEach(async () => {
    ({ app, db } = await buildTestApp());
    owner = await registerUser(app, "rank-owner");
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

  const setRank = async (taskId, body, token = owner.token) =>
    request(app).patch(`/api/tasks/${taskId}/rank`).set(auth(token)).send(body);

  const listOrdered = async (projectId, token = owner.token) =>
    request(app)
      .get("/api/tasks")
      .query({ projectId, sort: "rank", order: "asc", limit: 100 })
      .set(auth(token));

  it("orders newly-ranked tasks before never-ranked ones", async () => {
    const project = await createProject();
    const projectId = project.body.data.id;
    const a = await createTask(taskPayload({ projectId, title: "A" }));
    const b = await createTask(taskPayload({ projectId, title: "B" }));
    const c = await createTask(taskPayload({ projectId, title: "C" }));

    // Both neighbors here are still unranked (rank IS NULL), which is fine -
    // the schema only requires a real task id, not that it already has a rank.
    await setRank(b.body.data.id, { previousTaskId: null, nextTaskId: c.body.data.id });

    const list = await listOrdered(projectId);
    const ids = list.body.data.map((task) => task.id);

    expect(ids[0]).toBe(b.body.data.id);
    expect(ids.slice(1)).toEqual(expect.arrayContaining([a.body.data.id, c.body.data.id]));
  });

  it("moves a task between two ranked neighbors", async () => {
    const project = await createProject();
    const projectId = project.body.data.id;
    const a = await createTask(taskPayload({ projectId, title: "A" }));
    const b = await createTask(taskPayload({ projectId, title: "B" }));
    const c = await createTask(taskPayload({ projectId, title: "C" }));

    await setRank(a.body.data.id, { previousTaskId: null, nextTaskId: b.body.data.id });
    await setRank(b.body.data.id, { previousTaskId: a.body.data.id, nextTaskId: null });
    await setRank(c.body.data.id, { previousTaskId: a.body.data.id, nextTaskId: b.body.data.id });

    const list = await listOrdered(projectId);
    const ids = list.body.data.map((task) => task.id);

    expect(ids).toEqual([a.body.data.id, c.body.data.id, b.body.data.id]);
  });

  it("rejects a neighbor from a different project", async () => {
    const projectOne = await createProject(projectPayload({ key: "ONE", name: "One" }));
    const projectTwo = await createProject(projectPayload({ key: "TWO", name: "Two" }));
    const taskInOne = await createTask(taskPayload({ projectId: projectOne.body.data.id }));
    const taskInTwo = await createTask(taskPayload({ projectId: projectTwo.body.data.id }));

    const response = await setRank(taskInOne.body.data.id, {
      previousTaskId: taskInTwo.body.data.id,
      nextTaskId: null
    });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("TASK_RANK_NEIGHBOR_INVALID");
  });

  it("requires at least one neighbor", async () => {
    const task = await createTask(taskPayload());

    const response = await setRank(task.body.data.id, {
      previousTaskId: null,
      nextTaskId: null
    });

    expect(response.status).toBe(400);
  });

  it("blocks a viewer from reordering", async () => {
    const project = await createProject();
    const projectId = project.body.data.id;
    const viewer = await registerUser(app, "rank-viewer");
    await addMember(projectId, { email: viewer.user.email, role: "viewer" });
    const a = await createTask(taskPayload({ projectId, title: "A" }));
    const b = await createTask(taskPayload({ projectId, title: "B" }));

    const response = await setRank(
      b.body.data.id,
      { previousTaskId: a.body.data.id, nextTaskId: null },
      viewer.token
    );

    // verifyProjectAccess deliberately can't distinguish "no such project"
    // from "insufficient role" (see taskController.js), so this is 404 here -
    // same convention project-membership tests already accept for this reason.
    expect([403, 404]).toContain(response.status);
  });

  it("rebalances when repeated reordering exhausts the gap between two ranks", async () => {
    const project = await createProject();
    const projectId = project.body.data.id;
    const a = await createTask(taskPayload({ projectId, title: "A" }));
    const b = await createTask(taskPayload({ projectId, title: "B" }));
    const x1 = await createTask(taskPayload({ projectId, title: "X1" }));
    const x2 = await createTask(taskPayload({ projectId, title: "X2" }));

    await setRank(a.body.data.id, { previousTaskId: null, nextTaskId: b.body.data.id });
    await setRank(b.body.data.id, { previousTaskId: a.body.data.id, nextTaskId: null });

    // Repeatedly wedge x1/x2 between "a" and whichever of the two currently
    // sits closest to it, halving that gap every time. After enough
    // halvings, float precision can no longer fit a value strictly between
    // the two neighbors and the rebalance path has to kick in.
    let cursorId = b.body.data.id;
    for (let i = 0; i < 60; i += 1) {
      const mover = i % 2 === 0 ? x1 : x2;
      await setRank(mover.body.data.id, {
        previousTaskId: a.body.data.id,
        nextTaskId: cursorId
      });
      cursorId = mover.body.data.id;
    }

    const list = await listOrdered(projectId);
    const ids = list.body.data.map((task) => task.id);
    const ranks = list.body.data.map((task) => task.rank);

    expect(new Set(ranks).size).toBe(ranks.length);
    expect(ids[0]).toBe(a.body.data.id);
    expect(ids[3]).toBe(b.body.data.id);
    expect(new Set(ids.slice(1, 3))).toEqual(new Set([x1.body.data.id, x2.body.data.id]));
  });
});
