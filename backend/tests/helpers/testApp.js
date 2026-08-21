const fs = require("node:fs");
const path = require("node:path");

const { newDb } = require("pg-mem");
const request = require("supertest");

const { createApp } = require("../../src/app");

const testConfig = {
  nodeEnv: "test",
  port: 0,
  databaseUrl: "test",
  jwtSecret: "test-secret-that-is-longer-than-thirty-two-characters",
  accessTokenTtl: "15m",
  refreshTokenDays: 7,
  refreshCookieName: "workflowhq_refresh",
  corsOrigins: ["http://localhost:5173"],
  cookieSameSite: "lax",
  secureCookies: false,
  trustProxy: false
};

const buildTestApp = async () => {
  const memoryDb = newDb({ autoCreateForeignKeyIndices: true });
  const adapter = memoryDb.adapters.createPg();
  const db = new adapter.Pool();
  const migrationsDirectory = path.resolve(__dirname, "../../migrations");
  const migrationFiles = fs
    .readdirSync(migrationsDirectory)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of migrationFiles) {
    const sql = fs
      .readFileSync(path.join(migrationsDirectory, file), "utf8")
      .replaceAll("TIMESTAMPTZ", "TIMESTAMP");
    await db.query(sql);
  }

  return { app: createApp({ db, config: testConfig }), db };
};

const registerUser = async (app, suffix = "one") => {
  const response = await request(app)
    .post("/api/auth/register")
    .send({
      name: `Test User ${suffix}`,
      email: `${suffix}@example.com`,
      password: "secure-password"
    });

  return {
    response,
    token: response.body.data?.accessToken,
    user: response.body.data?.user
  };
};

const auth = (token) => ({ Authorization: `Bearer ${token}` });

module.exports = { auth, buildTestApp, registerUser, testConfig };
