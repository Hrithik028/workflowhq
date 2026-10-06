// Local-only browser QA. Never loads .env or contacts a provider/email service.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { Pool } = require("pg");
const request = require("supertest");
const { createApp } = require("../src/app");
const { testConfig } = require("../tests/helpers/testApp");

async function serve() {
  const connectionString = process.env.WORKFLOWHQ_TEST_DATABASE_URL;
  assert(connectionString, "Provide a disposable local QA database URL.");
  const target = new URL(connectionString);
  assert(
    ["127.0.0.1", "localhost", "[::1]"].includes(target.hostname),
    "Remote databases are prohibited."
  );
  assert(/^\/workflowhq_qa_[a-z0-9_]+$/u.test(target.pathname), "Use a workflowhq_qa_ database.");
  const db = new Pool({ connectionString });
  const tables = await db.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
  const resume = process.argv.includes("--resume");
  if (tables.rowCount) {
    assert(resume, "QA bootstrap requires an empty database. Nothing will be dropped.");
    const users = await db.query(
      "SELECT COUNT(*)::int AS count FROM users WHERE email IN ('owner@local.workflowhq.test', 'member@local.workflowhq.test')"
    );
    assert.equal(users.rows[0].count, 2, "Resume requires this script's existing QA accounts.");
  }
  const directory = path.join(__dirname, "../migrations");
  for (const file of (await fs.readdir(directory)).filter((name) => name.endsWith(".sql")).sort()) {
    if (tables.rowCount) break;
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query(await fs.readFile(path.join(directory, file), "utf8"));
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  const app = createApp({
    db,
    config: {
      ...testConfig,
      workspacesEnabled: true,
      corsOrigins: ["http://127.0.0.1:5183"],
      appBaseUrl: "http://127.0.0.1:5183"
    }
  });
  for (const [name, email] of [
    ["QA Owner", "owner@local.workflowhq.test"],
    ["QA Member", "member@local.workflowhq.test"]
  ]) {
    if (tables.rowCount) break;
    const result = await request(app)
      .post("/api/auth/register")
      .send({ name, email, password: "local-browser-qa-password" });
    assert.equal(result.status, 201, "QA account bootstrap failed.");
  }
  const server = app.listen(5068, "127.0.0.1", () =>
    process.stdout.write("Local workspace QA API ready at http://127.0.0.1:5068/api\n")
  );
  const stop = () => server.close(() => db.end().then(() => process.exit(0)));
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}
serve().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
