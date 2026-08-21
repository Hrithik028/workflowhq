const request = require("supertest");

const { auth, buildTestApp, registerUser } = require("./helpers/testApp");

describe("authentication API", () => {
  let app;
  let db;

  beforeEach(async () => {
    ({ app, db } = await buildTestApp());
  });

  afterEach(async () => {
    await db.end();
  });

  it("registers a user, hashes the password, and starts a session", async () => {
    const { response, user } = await registerUser(app);

    expect(response.status).toBe(201);
    expect(response.body.data.accessToken).toEqual(expect.any(String));
    expect(response.headers["set-cookie"][0]).toContain("HttpOnly");
    expect(user.email).toBe("one@example.com");

    const stored = await db.query("SELECT password_hash FROM users WHERE id = $1", [user.id]);
    expect(stored.rows[0].password_hash).not.toBe("secure-password");
  });

  it("rejects duplicate emails", async () => {
    await registerUser(app);
    const { response } = await registerUser(app);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("EMAIL_ALREADY_EXISTS");
  });

  it("returns field-level validation errors for invalid registration", async () => {
    const response = await request(app).post("/api/auth/register").send({
      name: "A",
      email: "not-an-email",
      password: "short"
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.details).toHaveLength(3);
  });

  it("logs in with valid credentials and rejects an incorrect password", async () => {
    await registerUser(app);

    const valid = await request(app).post("/api/auth/login").send({
      email: "ONE@example.com",
      password: "secure-password"
    });
    const invalid = await request(app).post("/api/auth/login").send({
      email: "one@example.com",
      password: "wrong-password"
    });

    expect(valid.status).toBe(200);
    expect(valid.body.data.user.email).toBe("one@example.com");
    expect(invalid.status).toBe(401);
    expect(invalid.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("protects user routes and returns the current authenticated user", async () => {
    const unauthenticated = await request(app).get("/api/auth/me");
    const { token, user } = await registerUser(app);
    const authenticated = await request(app).get("/api/auth/me").set(auth(token));

    expect(unauthenticated.status).toBe(401);
    expect(authenticated.status).toBe(200);
    expect(authenticated.body.data.id).toBe(user.id);
  });

  it("rotates a refresh session and invalidates it on logout", async () => {
    const agent = request.agent(app);
    const registration = await agent.post("/api/auth/register").send({
      name: "Session User",
      email: "session@example.com",
      password: "secure-password"
    });
    expect(registration.status).toBe(201);

    const refreshed = await agent.post("/api/auth/refresh");
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.data.accessToken).toEqual(expect.any(String));

    const logout = await agent.post("/api/auth/logout");
    const afterLogout = await agent.post("/api/auth/refresh");
    expect(logout.status).toBe(204);
    expect(afterLogout.status).toBe(401);
  });

  it("consumes each refresh token only once", async () => {
    const registration = await request(app).post("/api/auth/register").send({
      name: "Single Use Session",
      email: "single-use@example.com",
      password: "secure-password"
    });
    const originalCookie = registration.headers["set-cookie"][0].split(";")[0];

    const firstRefresh = await request(app).post("/api/auth/refresh").set("Cookie", originalCookie);
    const replay = await request(app).post("/api/auth/refresh").set("Cookie", originalCookie);

    expect(firstRefresh.status).toBe(200);
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe("REFRESH_INVALID");
  });
});
