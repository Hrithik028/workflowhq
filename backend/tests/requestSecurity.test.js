const request = require("supertest");

const { buildTestApp } = require("./helpers/testApp");

describe("request security", () => {
  let db;

  afterEach(async () => {
    await db?.end();
  });

  it("rejects cookie-backed authentication requests without a production origin", async () => {
    const built = await buildTestApp({ config: { nodeEnv: "production", secureCookies: true } });
    db = built.db;

    const response = await request(built.app).post("/api/auth/refresh");

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("TRUSTED_ORIGIN_REQUIRED");
  });

  it("rejects an origin outside the CORS allowlist", async () => {
    const built = await buildTestApp({ config: { nodeEnv: "production", secureCookies: true } });
    db = built.db;

    const response = await request(built.app)
      .post("/api/auth/refresh")
      .set("Origin", "https://attacker.example");

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("CORS_ORIGIN_DENIED");
  });

  it("allows cookie-backed authentication requests from the configured frontend", async () => {
    const built = await buildTestApp({ config: { nodeEnv: "production", secureCookies: true } });
    db = built.db;

    const response = await request(built.app)
      .post("/api/auth/refresh")
      .set("Origin", "http://localhost:5173");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("REFRESH_REQUIRED");
  });

  it("limits repeated API requests outside the test environment", async () => {
    const built = await buildTestApp({
      config: { nodeEnv: "development", apiRateLimit: 60 }
    });
    db = built.db;

    for (let attempt = 0; attempt < 60; attempt += 1) {
      const response = await request(built.app).get("/api/auth/me");
      expect(response.status).toBe(401);
    }

    const blocked = await request(built.app).get("/api/auth/me");
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("API_RATE_LIMITED");
  });
});
