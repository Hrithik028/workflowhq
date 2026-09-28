const request = require("supertest");

const { auth, buildTestApp, registerUser } = require("./helpers/testApp");

const previewRequest = (app, projectId, token) =>
  request(app).post(`/api/projects/${projectId}/ai-plan/preview`).set(auth(token)).send({
    provider: "openai",
    apiKey: "request-scoped-secret-key",
    model: "test-model",
    goal: "Apply a reviewed multi-action delivery plan safely.",
    maxItems: 8
  });

const createFields = (overrides = {}) => ({
  title: "New ticket",
  description: "Created by an approved plan.",
  status: "todo",
  priority: "medium",
  startDate: null,
  dueDate: null,
  taskType: "task",
  parentRef: null,
  assigneeId: null,
  sprintId: null,
  ...overrides
});

const action = (value) => ({ evidenceIds: [], ...value });

describe("atomic AI action executor", () => {
  let app;
  let db;
  let planner;
  let owner;
  let project;

  beforeEach(async () => {
    planner = { preview: globalThis.vi.fn() };
    ({ app, db } = await buildTestApp({
      config: { aiPlannerEnabled: true },
      aiPlanner: planner
    }));
    owner = await registerUser(app, "executor-owner");
    project = (
      await request(app)
        .post("/api/projects")
        .set(auth(owner.token))
        .send({ key: "EXE", name: "Executor", description: "Atomic agent actions" })
    ).body.data;
  });

  afterEach(async () => db.end());

  const approve = async (plan) => {
    planner.preview.mockResolvedValueOnce(plan);
    const preview = await previewRequest(app, project.id, owner.token);
    expect(preview.status).toBe(200);
    return preview.body.data.approval.id;
  };

  const createExistingTask = async (overrides = {}) =>
    (
      await request(app)
        .post("/api/tasks")
        .set(auth(owner.token))
        .send({
          title: "Existing ticket",
          description: "Before the reviewed plan.",
          status: "todo",
          priority: "medium",
          startDate: null,
          dueDate: null,
          projectId: project.id,
          taskType: "task",
          parentId: null,
          assigneeId: null,
          sprintId: null,
          ...overrides
        })
    ).body.data;

  it("resolves temporary hierarchy references and returns the recorded result on retry", async () => {
    const plan = {
      summary: "Create a parent and child, then finish configuring the child.",
      actions: [
        action({
          id: "create-epic",
          type: "task.create",
          tempId: "new:epic-1",
          fields: createFields({ title: "Delivery epic", taskType: "epic" })
        }),
        action({
          id: "create-task",
          type: "task.create",
          tempId: "new:task-1",
          fields: createFields({
            title: "Implement executor",
            taskType: "task",
            parentRef: "new:epic-1",
            assigneeId: owner.user.id
          })
        }),
        action({
          id: "add-criterion",
          type: "criterion.add",
          taskRef: "new:task-1",
          body: "The executor is atomic."
        }),
        action({
          id: "start-task",
          type: "task.update",
          taskRef: "new:task-1",
          fields: { status: "in_progress" }
        })
      ]
    };
    const approvalId = await approve(plan);
    const body = { approvalId, idempotencyKey: "executor-create-hierarchy", plan };
    const first = await request(app)
      .post(`/api/projects/${project.id}/ai-plan/apply`)
      .set(auth(owner.token))
      .send(body);
    const replay = await request(app)
      .post(`/api/projects/${project.id}/ai-plan/apply`)
      .set(auth(owner.token))
      .send(body);

    expect(first.status).toBe(200);
    expect(first.body.data.idempotent).toBe(false);
    expect(replay.status).toBe(200);
    expect(replay.body.data).toMatchObject({
      executionId: first.body.data.executionId,
      idempotent: true,
      references: first.body.data.references
    });
    const tasks = (
      await db.query("SELECT id, title, status, parent_task_id FROM tasks ORDER BY id ASC")
    ).rows;
    expect(tasks).toHaveLength(2);
    expect(tasks[1]).toMatchObject({ status: "in_progress", parent_task_id: tasks[0].id });
    expect((await db.query("SELECT * FROM task_acceptance_criteria")).rows).toHaveLength(1);
    expect((await db.query("SELECT * FROM ai_plan_executions")).rows).toHaveLength(1);
  });

  it("updates all ticket fields and acceptance criteria through shared mutation rules", async () => {
    const parent = await createExistingTask({ title: "Parent epic", taskType: "epic" });
    const task = await createExistingTask();
    const firstCriterion = (
      await request(app)
        .post(`/api/tasks/${task.id}/criteria`)
        .set(auth(owner.token))
        .send({ body: "First criterion" })
    ).body.data;
    const secondCriterion = (
      await request(app)
        .post(`/api/tasks/${task.id}/criteria`)
        .set(auth(owner.token))
        .send({ body: "Second criterion" })
    ).body.data;
    const reviewed = (await db.query("SELECT version FROM tasks WHERE id = $1", [task.id])).rows[0]
      .version;
    const plan = {
      summary: "Update the ticket and its ordered acceptance criteria.",
      actions: [
        action({
          id: "update-fields",
          type: "task.update",
          taskRef: task.id,
          expectedVersion: reviewed,
          fields: {
            title: "Updated ticket",
            description: "All supported fields were applied.",
            status: "in_progress",
            priority: "high",
            startDate: "2026-10-01",
            dueDate: "2026-10-10",
            taskType: "story",
            parentRef: parent.id,
            assigneeId: owner.user.id,
            sprintId: null
          }
        }),
        action({
          id: "edit-criterion",
          type: "criterion.update",
          taskRef: task.id,
          expectedVersion: reviewed,
          criterionId: firstCriterion.id,
          fields: { body: "Edited criterion" }
        }),
        action({
          id: "complete-criterion",
          type: "criterion.complete",
          taskRef: task.id,
          expectedVersion: reviewed,
          criterionId: firstCriterion.id
        }),
        action({
          id: "reorder-criteria",
          type: "criterion.reorder",
          taskRef: task.id,
          expectedVersion: reviewed,
          criterionIds: [Number(secondCriterion.id), Number(firstCriterion.id)]
        }),
        action({
          id: "remove-criterion",
          type: "criterion.remove",
          taskRef: task.id,
          expectedVersion: reviewed,
          criterionId: secondCriterion.id
        }),
        action({
          id: "archive-ticket",
          type: "task.archive",
          taskRef: task.id,
          expectedVersion: reviewed
        }),
        action({
          id: "restore-ticket",
          type: "task.restore",
          taskRef: task.id,
          expectedVersion: reviewed
        })
      ]
    };
    const approvalId = await approve(plan);
    const response = await request(app)
      .post(`/api/projects/${project.id}/ai-plan/apply`)
      .set(auth(owner.token))
      .send({ approvalId, idempotencyKey: "executor-update-everything", plan });

    expect(response.status).toBe(200);
    const updated = (await db.query("SELECT * FROM tasks WHERE id = $1", [task.id])).rows[0];
    expect(updated).toMatchObject({
      title: "Updated ticket",
      description: "All supported fields were applied.",
      status: "in_progress",
      priority: "high",
      task_type: "story",
      parent_task_id: parent.id,
      assignee_id: owner.user.id,
      archived_at: null
    });
    const criteria = (
      await db.query(
        "SELECT id, body, completed, position FROM task_acceptance_criteria WHERE task_id = $1",
        [task.id]
      )
    ).rows;
    expect(criteria).toEqual([
      expect.objectContaining({
        id: firstCriterion.id,
        body: "Edited criterion",
        completed: true,
        position: 1
      })
    ]);
  });

  it("rolls back every action and its idempotency reservation when a later action fails", async () => {
    const task = await createExistingTask();
    const plan = {
      summary: "A later invalid criterion must roll back the earlier create.",
      actions: [
        action({
          id: "create-before-failure",
          type: "task.create",
          tempId: "new:rollback",
          fields: createFields({ title: "Must roll back" })
        }),
        action({
          id: "invalid-remove",
          type: "criterion.remove",
          taskRef: task.id,
          expectedVersion: task.version,
          criterionId: 999999
        })
      ]
    };
    const approvalId = await approve(plan);
    const connect = db.connect.bind(db);
    let rolledBack = false;
    db.connect = async () => {
      const client = await connect();
      const query = client.query.bind(client);
      client.query = async (...args) => {
        if (args[0] === "ROLLBACK") rolledBack = true;
        return query(...args);
      };
      return client;
    };
    const response = await request(app)
      .post(`/api/projects/${project.id}/ai-plan/apply`)
      .set(auth(owner.token))
      .send({ approvalId, idempotencyKey: "executor-rollback-plan", plan });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("ACCEPTANCE_CRITERION_NOT_FOUND");
    // pg-mem accepts transaction statements but does not restore table state on
    // ROLLBACK. Assert that the API took the rollback path; PostgreSQL provides
    // the all-or-nothing semantics for the transaction in production.
    expect(rolledBack).toBe(true);
    expect(
      (await db.query("SELECT applied_at FROM ai_plan_approvals WHERE id = $1", [approvalId]))
        .rows[0].applied_at
    ).toBeNull();
  });

  it("rejects stale reviewed versions before applying any action", async () => {
    const task = await createExistingTask();
    const plan = {
      summary: "Do not apply a stale update.",
      actions: [
        action({
          id: "stale-update",
          type: "task.update",
          taskRef: task.id,
          expectedVersion: task.version,
          fields: { title: "Stale title" }
        })
      ]
    };
    const approvalId = await approve(plan);
    expect(planner.preview).toHaveBeenLastCalledWith(
      expect.objectContaining({
        projectContext: expect.objectContaining({
          prompt: expect.stringContaining(`version ${task.version}`)
        })
      })
    );
    await db.query("UPDATE tasks SET version = version + 1 WHERE id = $1", [task.id]);
    const response = await request(app)
      .post(`/api/projects/${project.id}/ai-plan/apply`)
      .set(auth(owner.token))
      .send({ approvalId, idempotencyKey: "executor-stale-version", plan });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("TASK_VERSION_CONFLICT");
    expect((await db.query("SELECT title FROM tasks WHERE id = $1", [task.id])).rows[0].title).toBe(
      "Existing ticket"
    );
  });

  it("rechecks permissions inside execution and does not expose permanent deletion", async () => {
    const task = await createExistingTask();
    const plan = {
      summary: "Permission changes after review must win.",
      actions: [
        action({
          id: "permission-update",
          type: "task.update",
          taskRef: task.id,
          expectedVersion: task.version,
          fields: { status: "completed" }
        })
      ]
    };
    const approvalId = await approve(plan);
    await db.query(
      `INSERT INTO user_permissions (user_id, permission_key, allowed)
       VALUES ($1, 'tasks.edit', FALSE)`,
      [owner.user.id]
    );
    const denied = await request(app)
      .post(`/api/projects/${project.id}/ai-plan/apply`)
      .set(auth(owner.token))
      .send({ approvalId, idempotencyKey: "executor-permission-recheck", plan });
    const destructive = await request(app)
      .post(`/api/projects/${project.id}/ai-plan/apply`)
      .set(auth(owner.token))
      .send({
        approvalId,
        idempotencyKey: "executor-delete-forbidden",
        plan: {
          summary: "Delete a ticket.",
          actions: [
            {
              id: "delete-ticket",
              type: "task.delete",
              taskRef: task.id,
              expectedVersion: task.version,
              evidenceIds: []
            }
          ]
        }
      });

    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("PERMISSION_DENIED");
    expect(destructive.status).toBe(400);
    expect(
      (await db.query("SELECT status FROM tasks WHERE id = $1", [task.id])).rows[0].status
    ).toBe("todo");
  });
});
