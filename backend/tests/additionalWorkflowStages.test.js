const request = require("supertest");
const { auth, buildTestApp, registerUser } = require("./helpers/testApp");
describe("additional project stages", () => {
  let app, db, owner, id, rules;
  const statuses = [
    { status: "todo", label: "Backlog", category: "todo" },
    { status: "in_progress", label: "Building", category: "in_progress" },
    { status: "review", label: "Review", category: "in_progress" },
    { status: "qa", label: "QA", category: "in_progress" },
    { status: "completed", label: "Released", category: "completed" }
  ];
  const transitions = [
    { fromStatus: "todo", toStatus: "in_progress" },
    { fromStatus: "in_progress", toStatus: "review" },
    { fromStatus: "review", toStatus: "qa" },
    { fromStatus: "qa", toStatus: "completed" }
  ];
  const configure = (stages = statuses, moves = transitions) =>
    request(app)
      .put(`/api/projects/${id}/workflow`)
      .set(auth(owner.token))
      .send({ rules, statuses: stages, transitions: moves });
  beforeEach(async () => {
    ({ app, db } = await buildTestApp());
    owner = await registerUser(app, "extra-stage-owner");
    id = (
      await request(app)
        .post("/api/projects")
        .set(auth(owner.token))
        .send({ key: "STG", name: "Stage QA" })
    ).body.data.id;
    rules = (
      await request(app).get(`/api/projects/${id}/workflow`).set(auth(owner.token))
    ).body.data.rules.map(({ trigger, enabled, fromStatus, toStatus }) => ({
      trigger,
      enabled,
      fromStatus,
      toStatus
    }));
  });
  afterEach(async () => db.end());
  it("persists ordered stages and enforces moves between stages in the same category", async () => {
    expect((await configure()).status).toBe(200);
    const input = {
      title: "Review work",
      projectId: id,
      status: "in_progress",
      workflowStage: "review"
    };
    let response = await request(app).post("/api/tasks").set(auth(owner.token)).send(input);
    expect(response.status).toBe(201);
    const taskId = response.body.data.id;
    response = await request(app)
      .put(`/api/tasks/${taskId}`)
      .set(auth(owner.token))
      .send({ ...input, workflowStage: "qa" });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      status: "in_progress",
      workflow_stage: "qa",
      status_label: "QA"
    });
    const blocked = await request(app)
      .put(`/api/tasks/${taskId}`)
      .set(auth(owner.token))
      .send({ ...input, workflowStage: "review" });
    expect(blocked.status).toBe(409);
    const unchanged = await request(app)
      .put(`/api/tasks/${taskId}`)
      .set(auth(owner.token))
      .send({ title: "Renamed", projectId: id, status: "in_progress" });
    expect(unchanged.body.data.workflow_stage).toBe("qa");
    const roadmap = await request(app)
      .get(`/api/projects/${id}/roadmap`)
      .set(auth(owner.token));
    expect(roadmap.status).toBe(200);
    expect(roadmap.body.data.tasks.find((item) => item.id === taskId)).toMatchObject({
      workflow_stage: "qa",
      status: "in_progress"
    });
  });
  it("protects stages containing archived tickets and immutable categories", async () => {
    await configure();
    const task = (
      await request(app)
        .post("/api/tasks")
        .set(auth(owner.token))
        .send({
          title: "Keep history",
          projectId: id,
          status: "in_progress",
          workflowStage: "review"
        })
    ).body.data;
    await request(app).post(`/api/tasks/${task.id}/archive`).set(auth(owner.token));
    const removed = await configure(
      statuses.filter((item) => item.status !== "review"),
      transitions.filter((move) => move.fromStatus !== "review" && move.toStatus !== "review")
    );
    expect(removed.status).toBe(409);
    expect(removed.body.error.code).toBe("WORKFLOW_STAGE_IN_USE");
    expect(
      (
        await configure(
          statuses.map((stage) =>
            stage.status === "qa" ? { ...stage, category: "completed" } : stage
          )
        )
      ).status
    ).toBe(409);
  });
  it("rejects foreign stages, category mismatches, missing anchors and dangling edges", async () => {
    await configure();
    for (const fields of [
      { workflowStage: "foreign", status: "in_progress" },
      { workflowStage: "qa", status: "completed" }
    ]) {
      expect(
        (
          await request(app)
            .post("/api/tasks")
            .set(auth(owner.token))
            .send({ title: "Invalid", projectId: id, ...fields })
        ).status
      ).toBe(400);
    }
    expect((await configure(statuses.filter((stage) => stage.status !== "todo"))).status).toBe(400);
    expect(
      (await configure(statuses, [{ fromStatus: "review", toStatus: "missing" }])).status
    ).toBe(400);
  });
  it("database rejects stage/category inconsistency", async () => {
    await configure();
    await expect(
      db.query(
        "INSERT INTO tasks(user_id,workspace_id,project_id,title,status,workflow_stage) VALUES($1,(SELECT workspace_id FROM projects WHERE id=$2),$2,'Mismatch','completed','qa')",
        [owner.user.id, id]
      )
    ).rejects.toThrow();
  });
});
