const request = require("supertest");

const { auth, buildTestApp, registerUser } = require("./helpers/testApp");

const allPermissions = {
  "projects.create": true,
  "projects.edit": true,
  "projects.delete": true,
  "projects.members": true,
  "tasks.create": true,
  "tasks.edit": true,
  "tasks.delete": true,
  "github.manage": true
};

const defaultRules = {
  allow_task_deletion: true,
  allow_project_deletion: true,
  require_due_date_for_high_priority: false,
  max_open_tasks_per_user: 100
};

describe("administrator access control", () => {
  it("denies ordinary users and lets a database-backed administrator inspect access", async () => {
    const { app, db } = await buildTestApp();
    const admin = await registerUser(app, "admin-overview");
    const member = await registerUser(app, "member-overview");
    await db.query("UPDATE users SET role = 'admin' WHERE id = $1", [admin.user.id]);

    const denied = await request(app).get("/api/admin/overview").set(auth(member.token));
    const allowed = await request(app).get("/api/admin/overview").set(auth(admin.token));

    expect(denied.status).toBe(403);
    expect(allowed.status, JSON.stringify(allowed.body)).toBe(200);
    expect(allowed.body.data.users).toHaveLength(2);
    expect(allowed.body.data.rules).toMatchObject(defaultRules);
  });

  it("enforces permission changes on protected operations immediately", async () => {
    const { app, db } = await buildTestApp();
    const admin = await registerUser(app, "admin-permissions");
    const member = await registerUser(app, "member-permissions");
    await db.query("UPDATE users SET role = 'admin' WHERE id = $1", [admin.user.id]);

    const project = await request(app)
      .post("/api/projects")
      .set(auth(member.token))
      .send({ key: "MEM", name: "Member project", description: "Permission test" });
    const task = await request(app).post("/api/tasks").set(auth(member.token)).send({
      projectId: project.body.data.id,
      title: "Protected deletion",
      description: "",
      status: "todo",
      priority: "medium",
      dueDate: null,
      taskType: "task",
      parentId: null
    });

    const access = await request(app)
      .put(`/api/admin/users/${member.user.id}/access`)
      .set(auth(admin.token))
      .send({ role: "user", permissions: { ...allPermissions, "tasks.delete": false } });
    const denied = await request(app)
      .delete(`/api/tasks/${task.body.data.id}`)
      .set(auth(member.token));

    expect(access.status, JSON.stringify(access.body)).toBe(200);
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("PERMISSION_DENIED");
  });

  it("enforces workspace rules and protects the last administrator", async () => {
    const { app, db } = await buildTestApp();
    const admin = await registerUser(app, "admin-rules");
    const member = await registerUser(app, "member-rules");
    await db.query("UPDATE users SET role = 'admin' WHERE id = $1", [admin.user.id]);

    const rules = await request(app)
      .put("/api/admin/rules")
      .set(auth(admin.token))
      .send({
        ...defaultRules,
        allow_project_deletion: false,
        require_due_date_for_high_priority: true
      });
    const project = await request(app)
      .post("/api/projects")
      .set(auth(member.token))
      .send({ key: "RULE", name: "Rules", description: "Rule test" });
    const deletion = await request(app)
      .delete(`/api/projects/${project.body.data.id}`)
      .set(auth(member.token));
    const highPriority = await request(app).post("/api/tasks").set(auth(member.token)).send({
      projectId: project.body.data.id,
      title: "Needs a deadline",
      description: "",
      status: "todo",
      priority: "high",
      dueDate: null,
      taskType: "task",
      parentId: null
    });
    const demotion = await request(app)
      .put(`/api/admin/users/${admin.user.id}/access`)
      .set(auth(admin.token))
      .send({ role: "user", permissions: allPermissions });

    expect(rules.status).toBe(200);
    expect(deletion.status).toBe(403);
    expect(highPriority.status).toBe(422);
    expect(demotion.status).toBe(409);
    expect(demotion.body.error.code).toBe("LAST_ADMIN_REQUIRED");
  });
});
