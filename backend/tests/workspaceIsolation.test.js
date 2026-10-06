const request = require("supertest");
const { auth, buildTestApp, registerUser } = require("./helpers/testApp");

describe("active workspace isolation", () => {
  let app;
  let db;
  beforeEach(
    async () => ({ app, db } = await buildTestApp({ config: { workspacesEnabled: true } }))
  );
  afterEach(async () => db?.end());

  it("switches the session and rejects old tokens, other-workspace reads and writes", async () => {
    const owner = await registerUser(app, "isolation-owner");
    const project = await request(app)
      .post("/api/projects")
      .set(auth(owner.token))
      .send({ key: "SAME", name: "Personal project" });
    expect(project.status).toBe(201);
    const task = await request(app)
      .post("/api/tasks")
      .set(auth(owner.token))
      .send({ title: "Personal ticket", projectId: project.body.data.id });
    expect(task.status).toBe(201);
    const workspace = await request(app)
      .post("/api/workspaces")
      .set(auth(owner.token))
      .send({ name: "Team workspace" });
    expect(workspace.status).toBe(201);
    const switched = await request(app)
      .post(`/api/workspaces/${workspace.body.data.id}/switch`)
      .set(auth(owner.token));
    expect(switched.status).toBe(200);
    const token = switched.body.data.accessToken;
    expect((await request(app).get("/api/projects").set(auth(owner.token))).status).toBe(409);
    expect(
      (await request(app).get(`/api/projects/${project.body.data.id}`).set(auth(token))).status
    ).toBe(404);
    expect(
      (await request(app).get(`/api/tasks/${task.body.data.id}/criteria`).set(auth(token))).status
    ).toBe(404);
    expect(
      (
        await request(app)
          .put(`/api/tasks/${task.body.data.id}`)
          .set(auth(token))
          .send({
            title: "Forbidden",
            status: "todo",
            priority: "medium",
            projectId: project.body.data.id
          })
      ).status
    ).toBe(404);
    expect(
      (
        await request(app)
          .post("/api/tasks")
          .set(auth(token))
          .send({ title: "Forbidden", projectId: project.body.data.id })
      ).status
    ).toBe(404);
    const secondProject = await request(app)
      .post("/api/projects")
      .set(auth(token))
      .send({ key: "SAME", name: "Team project" });
    expect(secondProject.status).toBe(201);
    const inbox = await request(app)
      .post("/api/tasks")
      .set(auth(token))
      .send({ title: "Team inbox" });
    expect(inbox.status).toBe(201);
    expect(
      (await request(app).get("/api/projects").set(auth(token))).body.data.map((p) => p.id)
    ).toEqual([secondProject.body.data.id]);
    expect(
      (await request(app).get("/api/tasks").set(auth(token))).body.data.map((t) => t.id)
    ).toEqual([inbox.body.data.id]);
    expect(
      (await request(app).get("/api/tasks/stats").set(auth(token))).body.data.total_tasks
    ).toBe(1);
    const activities = await request(app).get("/api/activity").set(auth(token));
    expect(activities.status).toBe(200);
    expect(activities.body.data.some((a) => a.entity_title === "Personal ticket")).toBe(false);
    const cookie = owner.response.headers["set-cookie"];
    const restored = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", cookie)
      .set("Origin", "http://localhost:5173");
    expect(restored.status).toBe(200);
    expect(restored.body.data.activeWorkspaceId).toBe(Number(workspace.body.data.id));
  });

  it("keeps workspace administration separate from platform access and enforces revocation", async () => {
    const owner = await registerUser(app, "team-owner");
    const member = await registerUser(app, "team-member");
    const workspace = await request(app)
      .post("/api/workspaces")
      .set(auth(owner.token))
      .send({ name: "Private team" });
    const id = workspace.body.data.id;
    expect(
      (
        await request(app)
          .put(`/api/workspaces/${id}/members`)
          .set(auth(owner.token))
          .send({ email: member.user.email, role: "admin" })
      ).status
    ).toBe(200);
    const switched = await request(app)
      .post(`/api/workspaces/${id}/switch`)
      .set(auth(member.token));
    const token = switched.body.data.accessToken;
    expect((await request(app).get(`/api/workspaces/${id}/members`).set(auth(token))).status).toBe(
      200
    );
    expect((await request(app).get("/api/admin/overview").set(auth(token))).status).toBe(403);
    expect(
      (
        await request(app)
          .put(`/api/workspaces/${id}/members`)
          .set(auth(token))
          .send({ email: owner.user.email, role: "member" })
      ).status
    ).toBe(403);
    expect(
      (
        await request(app)
          .delete(`/api/workspaces/${id}/members/${member.user.id}`)
          .set(auth(owner.token))
      ).status
    ).toBe(204);
    expect((await request(app).get("/api/projects").set(auth(token))).status).toBe(403);
    const listed = await request(app).get("/api/workspaces").set(auth(token));
    expect(listed.status).toBe(200);
    expect(listed.body.data.some((w) => Number(w.id) === Number(id))).toBe(false);
    const recovered = await request(app)
      .post(`/api/workspaces/${listed.body.data[0].id}/switch`)
      .set(auth(token));
    expect(recovered.status).toBe(200);
  });

  it("requires reauthentication for ownership transfer and keeps personal owners protected", async () => {
    const owner = await registerUser(app, "transfer-owner");
    const member = await registerUser(app, "transfer-member");
    const id = (
      await request(app)
        .post("/api/workspaces")
        .set(auth(owner.token))
        .send({ name: "Transfer team" })
    ).body.data.id;
    await request(app)
      .put(`/api/workspaces/${id}/members`)
      .set(auth(owner.token))
      .send({ email: member.user.email, role: "member" });
    const transfer = (password) =>
      request(app)
        .post(`/api/workspaces/${id}/ownership`)
        .set(auth(owner.token))
        .send({ targetUserId: member.user.id, password });
    expect((await transfer("incorrect-password")).status).toBe(403);
    expect((await transfer("secure-password")).status).toBe(200);
    expect((await transfer("secure-password")).status).toBe(404);
    const membership = (
      await db.query("SELECT user_id, role FROM workspace_members WHERE workspace_id = $1", [id])
    ).rows;
    expect(membership.filter((item) => item.role === "owner").map((item) => item.user_id)).toEqual([
      member.user.id
    ]);
    const personalId = (
      await request(app).get("/api/workspaces").set(auth(owner.token))
    ).body.data.find((w) => w.personal_owner_id === owner.user.id).id;
    expect(
      (
        await request(app)
          .post(`/api/workspaces/${personalId}/ownership`)
          .set(auth(owner.token))
          .send({ targetUserId: member.user.id, password: "secure-password" })
      ).status
    ).toBe(409);
  });

  it("isolates saved credentials and binds ciphertext to its workspace", async () => {
    const { decryptCredential } = require("../src/lib/aiCredentialVault");
    Object.assign(app.locals.config, {
      aiCredentialVaultEnabled: true,
      aiCredentialMasterKeys: { 1: Buffer.alloc(32, 11) },
      aiCredentialActiveKeyVersion: 1
    });
    const user = await registerUser(app, "workspace-key-owner");
    expect(
      (
        await request(app)
          .post("/api/ai/credentials")
          .set(auth(user.token))
          .send({ provider: "openai", credential: "personal-fixture-secret-1111" })
      ).status
    ).toBe(201);
    const id = (
      await request(app)
        .post("/api/workspaces")
        .set(auth(user.token))
        .send({ name: "Credential team" })
    ).body.data.id;
    const token = (await request(app).post(`/api/workspaces/${id}/switch`).set(auth(user.token)))
      .body.data.accessToken;
    expect(
      (await request(app).get("/api/ai/credentials").set(auth(token))).body.data.every(
        (item) => !item.configured
      )
    ).toBe(true);
    expect((await request(app).delete("/api/ai/credentials/openai").set(auth(token))).status).toBe(
      404
    );
    expect(
      (
        await request(app)
          .post("/api/ai/credentials")
          .set(auth(token))
          .send({ provider: "openai", credential: "team-fixture-secret-2222" })
      ).status
    ).toBe(201);
    const rows = (
      await db.query("SELECT * FROM ai_provider_credentials WHERE user_id = $1", [user.user.id])
    ).rows;
    expect(rows).toHaveLength(2);
    const teamKey = rows.find((item) => Number(item.workspace_id) === Number(id));
    expect(decryptCredential(teamKey, app.locals.config)).toBe("team-fixture-secret-2222");
    expect(() =>
      decryptCredential({ ...teamKey, workspace_id: Number(id) + 100 }, app.locals.config)
    ).toThrow("integrity check");
  });

  it("scopes inbox rank neighbors, notifications, task limits and tenant rules", async () => {
    const owner = await registerUser(app, "scoped-rules-owner");
    const member = await registerUser(app, "scoped-rules-member");
    const personalTask = (
      await request(app).post("/api/tasks").set(auth(owner.token)).send({ title: "Personal inbox" })
    ).body.data;
    const workspaceId = (
      await request(app).post("/api/workspaces").set(auth(owner.token)).send({ name: "Rules team" })
    ).body.data.id;
    const token = (
      await request(app).post(`/api/workspaces/${workspaceId}/switch`).set(auth(owner.token))
    ).body.data.accessToken;
    const rules = {
      allow_task_deletion: false,
      allow_project_deletion: false,
      require_due_date_for_high_priority: true,
      max_open_tasks_per_user: 1
    };
    expect(
      (
        await request(app)
          .put(`/api/workspaces/${workspaceId}/settings`)
          .set(auth(token))
          .send(rules)
      ).status
    ).toBe(200);
    const task = await request(app)
      .post("/api/tasks")
      .set(auth(token))
      .send({ title: "Team inbox" });
    expect(task.status).toBe(201);
    expect(
      (await request(app).post("/api/tasks").set(auth(token)).send({ title: "Over quota" })).status
    ).toBe(409);
    expect(
      (
        await request(app)
          .patch(`/api/tasks/${task.body.data.id}/rank`)
          .set(auth(token))
          .send({ previousTaskId: personalTask.id, nextTaskId: null })
      ).status
    ).toBe(422);
    const projectId = (
      await request(app)
        .post("/api/projects")
        .set(auth(token))
        .send({ key: "TEAM", name: "Scoped notices" })
    ).body.data.id;
    expect(
      (
        await request(app)
          .post(`/api/projects/${projectId}/members`)
          .set(auth(token))
          .send({ email: member.user.email, role: "editor" })
      ).status
    ).toBe(202);
    expect(
      (await request(app).get("/api/notifications").set(auth(member.token))).body.data
    ).toEqual([]);
    const teamToken = (
      await request(app).post(`/api/workspaces/${workspaceId}/switch`).set(auth(member.token))
    ).body.data.accessToken;
    expect(
      (await request(app).get("/api/notifications").set(auth(teamToken))).body.data[0].kind
    ).toBe("project_added");
  });

  it("preserves AI restrictions when saving rules and never relaxes platform policy", async () => {
    const { applyWorkspaceAiPolicy } = require("../src/lib/workspaceAiPolicy");
    const owner = await registerUser(app, "policy-owner");
    const member = await registerUser(app, "policy-member");
    const id = (
      await request(app)
        .post("/api/workspaces")
        .set(auth(owner.token))
        .send({ name: "Policy team" })
    ).body.data.id;
    const aiPolicy = {
      allowedProviders: ["openai", "anthropic"],
      dailyRunLimit: 3,
      maxPromptCharacters: 2000,
      maxOutputTokens: 900,
      maxProposedActions: 2
    };
    expect(
      (
        await request(app)
          .put(`/api/workspaces/${id}/ai-policy`)
          .set(auth(owner.token))
          .send(aiPolicy)
      ).status
    ).toBe(200);
    expect(
      (
        await request(app)
          .put(`/api/workspaces/${id}/ai-policy`)
          .set(auth(member.token))
          .send(aiPolicy)
      ).status
    ).toBe(404);
    expect(
      (
        await request(app)
          .put(`/api/workspaces/${id}/ai-policy`)
          .set(auth(owner.token))
          .send({ ...aiPolicy, enforcementEnabled: false })
      ).status
    ).toBe(400);
    const rules = {
      allow_task_deletion: false,
      allow_project_deletion: false,
      require_due_date_for_high_priority: true,
      max_open_tasks_per_user: 4
    };
    expect(
      (await request(app).put(`/api/workspaces/${id}/settings`).set(auth(owner.token)).send(rules))
        .status
    ).toBe(200);
    const settings = (
      await request(app).get(`/api/workspaces/${id}/settings`).set(auth(owner.token))
    ).body.data;
    expect(settings.aiPolicy).toEqual(aiPolicy);
    expect(settings.rules.max_open_tasks_per_user).toBe(4);
    expect(settings.audit.map((item) => item.action)).toContain("ai_policy_updated");
    const global = {
      enforcementEnabled: true,
      providerPolicies: [
        { provider: "openai", enabled: true },
        { provider: "anthropic", enabled: false },
        { provider: "google", enabled: true }
      ],
      dailyRunLimit: 2,
      maxPromptCharacters: 3000,
      maxOutputTokens: 700,
      maxProposedActions: 5
    };
    const effective = await applyWorkspaceAiPolicy(db, global, id);
    expect(effective).toMatchObject({
      enforcementEnabled: true,
      dailyRunLimit: 2,
      maxPromptCharacters: 2000,
      maxOutputTokens: 700,
      maxProposedActions: 2
    });
    expect(effective.providerPolicies.map((item) => item.enabled)).toEqual([true, false, false]);
  });

  it("returns the invitation workspace and prevents accepted links from restoring revoked access", async () => {
    const owner = await registerUser(app, "invitation-team-owner");
    const member = await registerUser(app, "invitation-team-recipient");
    const id = (
      await request(app)
        .post("/api/workspaces")
        .set(auth(owner.token))
        .send({ name: "Invite team" })
    ).body.data.id;
    const token = (await request(app).post(`/api/workspaces/${id}/switch`).set(auth(owner.token)))
      .body.data.accessToken;
    const projectId = (
      await request(app)
        .post("/api/projects")
        .set(auth(token))
        .send({ key: "INVITE", name: "Invite destination" })
    ).body.data.id;
    const invite = await request(app)
      .post(`/api/projects/${projectId}/invitations`)
      .set(auth(token))
      .send({ email: member.user.email, role: "editor" });
    const invitationToken = new URL(invite.body.data.inviteUrl).pathname.split("/").pop();
    const accept = () =>
      request(app)
        .post("/api/invitations/accept")
        .set(auth(member.token))
        .send({ token: invitationToken });
    const accepted = await accept();
    expect(accepted.status).toBe(200);
    expect(accepted.body.data.workspaceId).toBe(Number(id));
    expect((await accept()).body.data.alreadyAccepted).toBe(true);
    expect(
      (await db.query("SELECT * FROM notifications WHERE user_id = $1", [member.user.id])).rows
    ).toHaveLength(1);
    await db.query("DELETE FROM project_members WHERE project_id = $1 AND user_id = $2", [
      projectId,
      member.user.id
    ]);
    const replay = await accept();
    expect(replay.status).toBe(410);
    expect(replay.body.error.code).toBe("INVITATION_ACCESS_REVOKED");
  });
});
