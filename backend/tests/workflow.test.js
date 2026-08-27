const request = require("supertest");

const { auth, buildTestApp, registerUser } = require("./helpers/testApp");

const taskPayload = (overrides = {}) => ({
  title: "Configure production environment",
  description: "Prepare environment variables and deployment settings.",
  status: "todo",
  priority: "high",
  dueDate: "2026-09-01",
  projectId: null,
  taskType: "task",
  parentId: null,
  ...overrides
});

const projectPayload = (overrides = {}) => ({
  key: "WHQ",
  name: "Launch workspace",
  description: "Coordinate the production release.",
  ...overrides
});

describe("projects, tasks, and activity API", () => {
  let app;
  let db;
  let first;

  beforeEach(async () => {
    ({ app, db } = await buildTestApp());
    first = await registerUser(app, "owner");
  });

  afterEach(async () => {
    await db.end();
  });

  const createProject = async (payload = projectPayload(), token = first.token) =>
    request(app).post("/api/projects").set(auth(token)).send(payload);

  const createTask = async (payload = taskPayload(), token = first.token) =>
    request(app).post("/api/tasks").set(auth(token)).send(payload);

  it("creates, lists, updates, and deletes an owned project", async () => {
    const created = await createProject();
    const projectId = created.body.data.id;
    const listed = await request(app).get("/api/projects").set(auth(first.token));
    const updated = await request(app)
      .put(`/api/projects/${projectId}`)
      .set(auth(first.token))
      .send(
        projectPayload({ key: "PROD", name: "Production launch", description: "Updated scope." })
      );
    const deleted = await request(app).delete(`/api/projects/${projectId}`).set(auth(first.token));

    expect(created.status).toBe(201);
    expect(listed.body.data).toHaveLength(1);
    expect(updated.body.data.name).toBe("Production launch");
    expect(deleted.status).toBe(204);
  });

  it("normalizes project keys, rejects duplicates per owner, and permits the same key for another owner", async () => {
    const normalized = await createProject(projectPayload({ key: "whq" }));
    const duplicate = await createProject(
      projectPayload({ key: "WHQ", name: "Duplicate workspace" })
    );
    const second = await registerUser(app, "project-key-outsider");
    const otherOwner = await createProject(
      projectPayload({ key: "whq", name: "Independent workspace" }),
      second.token
    );

    expect(normalized.status).toBe(201);
    expect(normalized.body.data.key).toBe("WHQ");
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe("PROJECT_KEY_EXISTS");
    expect(otherOwner.status).toBe(201);
    expect(otherOwner.body.data.key).toBe("WHQ");
  });

  it("locks a project key after its first ticket is created", async () => {
    const project = await createProject();
    const projectId = project.body.data.id;
    const editable = await request(app)
      .put(`/api/projects/${projectId}`)
      .set(auth(first.token))
      .send(projectPayload({ key: "DEV" }));
    await createTask(taskPayload({ projectId }));
    const locked = await request(app)
      .put(`/api/projects/${projectId}`)
      .set(auth(first.token))
      .send(projectPayload({ key: "NEW" }));

    expect(editable.status).toBe(200);
    expect(editable.body.data.key).toBe("DEV");
    expect(locked.status).toBe(409);
    expect(locked.body.error.code).toBe("PROJECT_KEY_LOCKED");
  });

  it("creates, reads, updates, and deletes an owned task", async () => {
    const project = await createProject();
    const created = await createTask(taskPayload({ projectId: project.body.data.id }));
    const taskId = created.body.data.id;
    const read = await request(app).get(`/api/tasks/${taskId}`).set(auth(first.token));
    const updated = await request(app)
      .put(`/api/tasks/${taskId}`)
      .set(auth(first.token))
      .send(taskPayload({ projectId: project.body.data.id, status: "completed" }));
    const deleted = await request(app).delete(`/api/tasks/${taskId}`).set(auth(first.token));

    expect(created.status).toBe(201);
    expect(read.body.data.project_name).toBe("Launch workspace");
    expect(updated.body.data.status).toBe("completed");
    expect(deleted.status).toBe(204);
  });

  it("keeps a ticket issue key immutable when the task is updated or moved", async () => {
    const source = await createProject();
    const target = await createProject(projectPayload({ key: "RQU", name: "Requests UI" }));
    const created = await createTask(
      taskPayload({ projectId: source.body.data.id, taskType: "story" })
    );
    const issueKey = created.body.data.issue_key;
    const updated = await request(app)
      .put(`/api/tasks/${created.body.data.id}`)
      .set(auth(first.token))
      .send(
        taskPayload({
          projectId: target.body.data.id,
          taskType: "story",
          title: "Moved without renumbering"
        })
      );
    const read = await request(app)
      .get(`/api/tasks/${created.body.data.id}`)
      .set(auth(first.token));

    expect(issueKey).toMatch(/^WHQ-\d+$/);
    expect(updated.status).toBe(200);
    expect(read.body.data.project_key).toBe("RQU");
    expect(read.body.data.issue_key).toBe(issueKey);
  });

  it("creates valid parent-child work and returns hierarchy metadata", async () => {
    const project = await createProject();
    const parent = await createTask(
      taskPayload({
        projectId: project.body.data.id,
        taskType: "epic",
        title: "GitHub integration"
      })
    );
    const child = await request(app)
      .post(`/api/tasks/${parent.body.data.id}/children`)
      .set(auth(first.token))
      .send(
        taskPayload({
          projectId: project.body.data.id,
          taskType: "story",
          title: "Verify webhook signatures"
        })
      );
    const children = await request(app)
      .get(`/api/tasks/${parent.body.data.id}/children`)
      .set(auth(first.token));

    expect(parent.status).toBe(201);
    expect(child.status).toBe(201);
    expect(child.body.data).toMatchObject({
      parent_task_id: parent.body.data.id,
      parent_title: "GitHub integration",
      task_type: "story"
    });
    expect(children.status).toBe(200);
    expect(children.body.data).toHaveLength(1);
    expect(children.body.data[0].id).toBe(child.body.data.id);
  });

  it("rejects a parent from another project", async () => {
    const firstProject = await createProject();
    const secondProject = await createProject(projectPayload({ key: "RQU", name: "Requests UI" }));
    const parent = await createTask(
      taskPayload({ projectId: firstProject.body.data.id, taskType: "epic" })
    );
    const response = await createTask(
      taskPayload({
        projectId: secondProject.body.data.id,
        taskType: "story",
        parentId: parent.body.data.id
      })
    );

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("TASK_PROJECT_MISMATCH");
  });

  it("prevents a task update from introducing a hierarchy cycle", async () => {
    const project = await createProject();
    const parent = await createTask(
      taskPayload({ projectId: project.body.data.id, taskType: "initiative", title: "Platform" })
    );
    const child = await createTask(
      taskPayload({
        projectId: project.body.data.id,
        taskType: "epic",
        parentId: parent.body.data.id,
        title: "Developer workflow"
      })
    );
    const response = await request(app)
      .put(`/api/tasks/${parent.body.data.id}`)
      .set(auth(first.token))
      .send(
        taskPayload({
          projectId: project.body.data.id,
          taskType: "initiative",
          parentId: child.body.data.id,
          title: "Platform"
        })
      );

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("TASK_HIERARCHY_CYCLE");
  });

  it("enforces parent-child type ordering", async () => {
    const project = await createProject();
    const parent = await createTask(
      taskPayload({ projectId: project.body.data.id, taskType: "task" })
    );
    const response = await createTask(
      taskPayload({
        projectId: project.body.data.id,
        taskType: "story",
        parentId: parent.body.data.id
      })
    );

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("INVALID_TASK_HIERARCHY");
  });

  it("rejects a sixth hierarchy level", async () => {
    const project = await createProject();
    let parentId = null;
    for (const [index, taskType] of ["initiative", "epic", "story", "bug", "task"].entries()) {
      const inserted = await db.query(
        `INSERT INTO tasks
           (user_id, project_id, issue_key, task_type, parent_task_id, title, description, status, priority)
         VALUES ($1, $2, $3, $4, $5, $6, '', 'todo', 'medium')
         RETURNING id`,
        [
          first.user.id,
          project.body.data.id,
          `DEP-${index + 1}`,
          taskType,
          parentId,
          `Hierarchy level ${index + 1}`
        ]
      );
      parentId = inserted.rows[0].id;
    }

    const response = await createTask(
      taskPayload({
        projectId: project.body.data.id,
        taskType: "subtask",
        parentId,
        title: "Hierarchy level 6"
      })
    );

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("TASK_HIERARCHY_DEPTH");
  });

  it("rejects deleting a parent while it still has child tickets", async () => {
    const project = await createProject();
    const parent = await createTask(
      taskPayload({ projectId: project.body.data.id, taskType: "epic" })
    );
    await createTask(
      taskPayload({
        projectId: project.body.data.id,
        taskType: "story",
        parentId: parent.body.data.id
      })
    );
    const response = await request(app)
      .delete(`/api/tasks/${parent.body.data.id}`)
      .set(auth(first.token));

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("TASK_HAS_CHILDREN");
  });

  it("enforces task and project ownership for read, update, delete, and assignment", async () => {
    const project = await createProject();
    const task = await createTask(taskPayload({ projectId: project.body.data.id }));
    const second = await registerUser(app, "outsider");

    const readTask = await request(app)
      .get(`/api/tasks/${task.body.data.id}`)
      .set(auth(second.token));
    const updateTask = await request(app)
      .put(`/api/tasks/${task.body.data.id}`)
      .set(auth(second.token))
      .send(taskPayload());
    const deleteTask = await request(app)
      .delete(`/api/tasks/${task.body.data.id}`)
      .set(auth(second.token));
    const readProject = await request(app)
      .get(`/api/projects/${project.body.data.id}`)
      .set(auth(second.token));
    const assignProject = await createTask(
      taskPayload({ projectId: project.body.data.id }),
      second.token
    );

    expect(readTask.status).toBe(404);
    expect(updateTask.status).toBe(404);
    expect(deleteTask.status).toBe(404);
    expect(readProject.status).toBe(404);
    expect(assignProject.status).toBe(404);
  });

  it("does not expose another owner's task as an available parent", async () => {
    const project = await createProject();
    const parent = await createTask(
      taskPayload({ projectId: project.body.data.id, taskType: "epic" })
    );
    const second = await registerUser(app, "hierarchy-outsider");
    const secondProject = await createProject(
      projectPayload({ key: "OUT", name: "Outsider project" }),
      second.token
    );
    const response = await createTask(
      taskPayload({
        projectId: secondProject.body.data.id,
        taskType: "story",
        parentId: parent.body.data.id
      }),
      second.token
    );

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("PARENT_TASK_NOT_FOUND");
  });

  it("filters, searches, sorts, and paginates bounded task results", async () => {
    await createTask(taskPayload({ title: "Deploy API", status: "in_progress", priority: "high" }));
    await createTask(
      taskPayload({ title: "Write release notes", status: "todo", priority: "low" })
    );
    await createTask(
      taskPayload({ title: "Run API smoke tests", status: "completed", priority: "medium" })
    );

    const filtered = await request(app)
      .get("/api/tasks?status=in_progress&priority=high")
      .set(auth(first.token));
    const searched = await request(app)
      .get("/api/tasks?search=API&sort=title&order=asc&page=1&limit=1")
      .set(auth(first.token));

    expect(filtered.status).toBe(200);
    expect(filtered.body.data.map((task) => task.title)).toEqual(["Deploy API"]);
    expect(searched.body.data).toHaveLength(1);
    expect(searched.body.pagination).toEqual({ page: 1, limit: 1, total: 2, pages: 2 });
  });

  it("returns useful task statistics including overdue work", async () => {
    await createTask(taskPayload({ title: "Overdue task", dueDate: "2020-01-01" }));
    await createTask(
      taskPayload({ title: "Completed task", status: "completed", priority: "low" })
    );
    const response = await request(app).get("/api/tasks/stats").set(auth(first.token));

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      total_tasks: 2,
      completed_tasks: 1,
      todo_tasks: 1,
      high_priority_tasks: 1,
      overdue_tasks: 1
    });
  });

  it.each([
    ["invalid status", taskPayload({ status: "blocked" })],
    ["invalid priority", taskPayload({ priority: "urgent" })],
    ["missing title", taskPayload({ title: "" })]
  ])("rejects %s", async (_name, payload) => {
    const response = await createTask(payload);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects malformed identifiers and unbounded pagination", async () => {
    const malformed = await request(app).get("/api/tasks/not-a-number").set(auth(first.token));
    const unbounded = await request(app).get("/api/tasks?limit=101").set(auth(first.token));

    expect(malformed.status).toBe(400);
    expect(unbounded.status).toBe(400);
  });

  it("returns only the authenticated user's activity", async () => {
    await createTask();
    const second = await registerUser(app, "activity-outsider");
    await createTask(taskPayload({ title: "Private outsider task" }), second.token);

    const response = await request(app).get("/api/activity").set(auth(first.token));
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].entity_title).toBe("Configure production environment");
  });
});
