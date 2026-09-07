const request = require("supertest");

const { auth, buildTestApp, registerUser } = require("./helpers/testApp");

const projectPayload = {
  key: "INV",
  name: "Invitation rollout",
  description: "Verify pending membership invitations."
};

const tokenFrom = (inviteUrl) => new URL(inviteUrl).pathname.split("/").pop();

describe("project invitations", () => {
  let app;
  let db;
  let owner;
  let projectId;

  beforeEach(async () => {
    ({ app, db } = await buildTestApp());
    owner = await registerUser(app, "invitation-owner");
    const project = await request(app)
      .post("/api/projects")
      .set(auth(owner.token))
      .send(projectPayload);
    projectId = project.body.data.id;
  });

  afterEach(async () => {
    await db.end();
  });

  const invite = (email, role = "editor", token = owner.token) =>
    request(app)
      .post(`/api/projects/${projectId}/invitations`)
      .set(auth(token))
      .send({ email, role });

  it("creates a pending invitation without storing the plaintext token", async () => {
    const response = await invite("future-member@example.com", "viewer");
    const token = tokenFrom(response.body.data.inviteUrl);
    const stored = await db.query(
      "SELECT token_hash, status, delivery_status FROM project_invitations WHERE id = $1",
      [response.body.data.invitation.id]
    );
    const pending = await request(app)
      .get(`/api/projects/${projectId}/invitations`)
      .set(auth(owner.token));

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ deliveryStatus: "not_configured" });
    expect(response.body.data.invitation).toMatchObject({
      email: "future-member@example.com",
      role: "viewer",
      status: "pending"
    });
    expect(token).toHaveLength(43);
    expect(stored.rows[0].token_hash).toHaveLength(64);
    expect(stored.rows[0].token_hash).not.toBe(token);
    expect(stored.rows[0].delivery_status).toBe("not_configured");
    expect(pending.body.data).toHaveLength(1);
  });

  it("requires the invited account email and grants membership only after acceptance", async () => {
    const invitee = await registerUser(app, "invitation-recipient");
    const outsider = await registerUser(app, "invitation-outsider");
    const created = await invite(invitee.user.email, "editor");
    const token = tokenFrom(created.body.data.inviteUrl);

    const before = await request(app)
      .get(`/api/projects/${projectId}`)
      .set(auth(invitee.token));
    const wrongAccount = await request(app)
      .post("/api/invitations/inspect")
      .set(auth(outsider.token))
      .send({ token });
    const details = await request(app)
      .post("/api/invitations/inspect")
      .set(auth(invitee.token))
      .send({ token });
    const accepted = await request(app)
      .post("/api/invitations/accept")
      .set(auth(invitee.token))
      .send({ token });
    const after = await request(app)
      .get(`/api/projects/${projectId}`)
      .set(auth(invitee.token));
    const replay = await request(app)
      .post("/api/invitations/accept")
      .set(auth(invitee.token))
      .send({ token });

    expect(before.status).toBe(404);
    expect(wrongAccount.status).toBe(403);
    expect(wrongAccount.body.error.code).toBe("INVITATION_EMAIL_MISMATCH");
    expect(details.body.data).toMatchObject({
      projectKey: "INV",
      projectName: "Invitation rollout",
      role: "editor",
      status: "pending"
    });
    expect(accepted.body.data).toMatchObject({
      projectId,
      role: "editor",
      alreadyAccepted: false
    });
    expect(after.status).toBe(200);
    expect(after.body.data.my_role).toBe("editor");
    expect(replay.body.data.alreadyAccepted).toBe(true);
  });

  it("supports declining and owner revocation without creating a membership", async () => {
    const declinedUser = await registerUser(app, "invitation-declined");
    const revokedUser = await registerUser(app, "invitation-revoked");
    const declinedInvite = await invite(declinedUser.user.email);
    const revokedInvite = await invite(revokedUser.user.email);
    const declinedToken = tokenFrom(declinedInvite.body.data.inviteUrl);
    const revokedToken = tokenFrom(revokedInvite.body.data.inviteUrl);

    const declined = await request(app)
      .post("/api/invitations/decline")
      .set(auth(declinedUser.token))
      .send({ token: declinedToken });
    const revoked = await request(app)
      .delete(`/api/projects/${projectId}/invitations/${revokedInvite.body.data.invitation.id}`)
      .set(auth(owner.token));
    const acceptDeclined = await request(app)
      .post("/api/invitations/accept")
      .set(auth(declinedUser.token))
      .send({ token: declinedToken });
    const acceptRevoked = await request(app)
      .post("/api/invitations/accept")
      .set(auth(revokedUser.token))
      .send({ token: revokedToken });

    expect(declined.status).toBe(204);
    expect(revoked.status).toBe(204);
    expect(acceptDeclined.status).toBe(410);
    expect(acceptRevoked.status).toBe(410);
    const memberCount = await db.query(
      "SELECT COUNT(*)::int AS count FROM project_members WHERE project_id = $1",
      [projectId]
    );
    expect(memberCount.rows[0].count).toBe(1);
  });

  it("rejects expired invitations and prevents non-owners from managing them", async () => {
    const invitee = await registerUser(app, "invitation-expired");
    const editor = await registerUser(app, "invitation-editor");
    await request(app)
      .post(`/api/projects/${projectId}/members`)
      .set(auth(owner.token))
      .send({ email: editor.user.email, role: "editor" });
    const created = await invite(invitee.user.email);
    const token = tokenFrom(created.body.data.inviteUrl);
    await db.query(
      "UPDATE project_invitations SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 hour' WHERE id = $1",
      [created.body.data.invitation.id]
    );

    const expired = await request(app)
      .post("/api/invitations/accept")
      .set(auth(invitee.token))
      .send({ token });
    const forbiddenList = await request(app)
      .get(`/api/projects/${projectId}/invitations`)
      .set(auth(editor.token));
    const forbiddenInvite = await invite("blocked@example.com", "viewer", editor.token);

    expect(expired.status).toBe(410);
    expect(expired.body.error.code).toBe("INVITATION_EXPIRED");
    expect(forbiddenList.status).toBe(403);
    expect(forbiddenInvite.status).toBe(403);
  });

  it("records successful email delivery through the injected mailer", async () => {
    await db.end();
    const sendProjectInvitation = globalThis.vi.fn().mockResolvedValue({ status: "sent" });
    ({ app, db } = await buildTestApp({ invitationMailer: { sendProjectInvitation } }));
    owner = await registerUser(app, "invitation-mail-owner");
    const project = await request(app)
      .post("/api/projects")
      .set(auth(owner.token))
      .send({ ...projectPayload, key: "MAIL" });
    projectId = project.body.data.id;

    const response = await invite("delivery@example.com");

    expect(response.body.data.deliveryStatus).toBe("sent");
    expect(sendProjectInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "delivery@example.com",
        projectName: "Invitation rollout",
        role: "editor"
      })
    );
  });
});
