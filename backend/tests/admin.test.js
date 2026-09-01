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

  it("protects the platform owner from ordinary access updates", async () => {
    const { app, db } = await buildTestApp();
    const owner = await registerUser(app, "protected-owner");
    const admin = await registerUser(app, "protected-admin");
    await db.query("UPDATE users SET role = 'platform_owner' WHERE id = $1", [owner.user.id]);
    await db.query("UPDATE users SET role = 'admin' WHERE id = $1", [admin.user.id]);

    const ownerOverview = await request(app)
      .get("/api/admin/overview")
      .set(auth(owner.token));
    const attemptedChange = await request(app)
      .put(`/api/admin/users/${owner.user.id}/access`)
      .set(auth(admin.token))
      .send({ role: "admin", permissions: allPermissions });

    expect(ownerOverview.status, JSON.stringify(ownerOverview.body)).toBe(200);
    expect(attemptedChange.status).toBe(409);
    expect(attemptedChange.body.error.code).toBe("PLATFORM_OWNER_PROTECTED");
  });

  it("transfers platform ownership atomically and revokes both accounts' refresh sessions", async () => {
    const { app, db } = await buildTestApp();
    const owner = await registerUser(app, "transfer-owner");
    const admin = await registerUser(app, "transfer-admin");
    const member = await registerUser(app, "transfer-member");
    await db.query("UPDATE users SET role = 'platform_owner' WHERE id = $1", [owner.user.id]);
    await db.query("UPDATE users SET role = 'admin' WHERE id = $1", [admin.user.id]);

    const adminDenied = await request(app)
      .post("/api/admin/platform-owner/transfer")
      .set(auth(admin.token))
      .send({ targetUserId: member.user.id, password: "secure-password" });
    const memberRejected = await request(app)
      .post("/api/admin/platform-owner/transfer")
      .set(auth(owner.token))
      .send({ targetUserId: member.user.id, password: "secure-password" });
    const wrongPassword = await request(app)
      .post("/api/admin/platform-owner/transfer")
      .set(auth(owner.token))
      .send({ targetUserId: admin.user.id, password: "wrong-password" });
    const transferred = await request(app)
      .post("/api/admin/platform-owner/transfer")
      .set(auth(owner.token))
      .send({ targetUserId: admin.user.id, password: "secure-password" });
    const previousOwnerSession = await request(app)
      .get("/api/auth/me")
      .set(auth(owner.token));
    const nextOwnerSession = await request(app)
      .get("/api/auth/me")
      .set(auth(admin.token));

    const roles = await db.query(
      "SELECT id, role FROM users WHERE id IN ($1, $2) ORDER BY id",
      [owner.user.id, admin.user.id]
    );
    const sessions = await db.query(
      "SELECT user_id FROM refresh_sessions WHERE user_id IN ($1, $2)",
      [owner.user.id, admin.user.id]
    );
    const audit = await db.query(
      "SELECT action, admin_user_id, target_user_id FROM admin_audit_log WHERE action = 'platform_ownership_transferred'"
    );

    expect(adminDenied.status).toBe(403);
    expect(adminDenied.body.error.code).toBe("PLATFORM_OWNER_REQUIRED");
    expect(memberRejected.status).toBe(409);
    expect(memberRejected.body.error.code).toBe("OWNER_TARGET_ADMIN_REQUIRED");
    expect(wrongPassword.status).toBe(403);
    expect(wrongPassword.body.error.code).toBe("OWNER_REAUTH_FAILED");
    expect(transferred.status, JSON.stringify(transferred.body)).toBe(200);
    expect(transferred.body.data.owner).toMatchObject({
      id: admin.user.id,
      role: "platform_owner"
    });
    expect(previousOwnerSession.status).toBe(401);
    expect(nextOwnerSession.status).toBe(401);
    expect(roles.rows).toEqual([
      expect.objectContaining({ id: owner.user.id, role: "admin" }),
      expect.objectContaining({ id: admin.user.id, role: "platform_owner" })
    ]);
    expect(sessions.rows).toHaveLength(0);
    expect(audit.rows).toEqual([
      expect.objectContaining({
        action: "platform_ownership_transferred",
        admin_user_id: owner.user.id,
        target_user_id: admin.user.id
      })
    ]);
  });
});
