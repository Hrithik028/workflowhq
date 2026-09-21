const request = require("supertest");

const { auth, buildTestApp, registerUser } = require("./helpers/testApp");

describe("session management", () => {
  let app;
  let db;

  beforeEach(async () => {
    ({ app, db } = await buildTestApp());
  });

  afterEach(async () => {
    await db.end();
  });

  it("lists the current session and preserves its identity during refresh rotation", async () => {
    const agent = request.agent(app);
    const registration = await agent
      .post("/api/auth/register")
      .set("User-Agent", "WorkflowHQ session test")
      .send({ name: "Session User", email: "sessions@example.com", password: "secure-password" });
    const token = registration.body.data.accessToken;

    const before = await agent.get("/api/auth/sessions").set(auth(token));
    const refreshed = await agent.post("/api/auth/refresh");
    const after = await agent.get("/api/auth/sessions").set(auth(refreshed.body.data.accessToken));

    expect(before.body.data).toHaveLength(1);
    expect(before.body.data[0]).toMatchObject({
      current: true,
      userAgent: "WorkflowHQ session test"
    });
    expect(after.body.data[0].id).toBe(before.body.data[0].id);
  });

  it("revokes one session without exposing another user's sessions", async () => {
    const first = await registerUser(app, "session-owner");
    const second = await registerUser(app, "other-session-owner");
    const sessions = await request(app).get("/api/auth/sessions").set(auth(first.token));
    const sessionId = sessions.body.data[0].id;

    const forbidden = await request(app)
      .delete(`/api/auth/sessions/${sessionId}`)
      .set(auth(second.token));
    const revoked = await request(app)
      .delete(`/api/auth/sessions/${sessionId}`)
      .set(auth(first.token));
    const afterRevoke = await request(app).get("/api/auth/me").set(auth(first.token));

    expect(forbidden.status).toBe(404);
    expect(revoked.status).toBe(204);
    expect(afterRevoke.status).toBe(401);
  });

  it("signs out every session and invalidates existing access tokens", async () => {
    const registered = await registerUser(app, "all-sessions");

    const response = await request(app).delete("/api/auth/sessions").set(auth(registered.token));
    const after = await request(app).get("/api/auth/me").set(auth(registered.token));

    expect(response.status).toBe(204);
    expect(after.status).toBe(401);
    expect((await db.query("SELECT * FROM refresh_sessions")).rows).toHaveLength(0);
  });
});
