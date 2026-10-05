const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { Pool } = require("pg");
const request = require("supertest");
const { createApp } = require("../src/app");
const { testConfig } = require("../tests/helpers/testApp");
const { reserveAiPreview } = require("../src/lib/aiGovernance");
const { aiPlannerSchemas } = require("../src/validation/aiPlannerSchemas");

async function verify() {
  const connectionString = process.env.WORKFLOWHQ_TEST_DATABASE_URL;
  assert(
    connectionString,
    "Set WORKFLOWHQ_TEST_DATABASE_URL to an empty disposable local database."
  );
  const target = new URL(connectionString);
  assert(
    ["127.0.0.1", "localhost", "[::1]"].includes(target.hostname),
    "Remote databases are prohibited."
  );
  assert(
    /^\/workflowhq_qa_[a-z0-9_]+$/u.test(target.pathname),
    "Use a workflowhq_qa_ database name."
  );
  const db = new Pool({ connectionString, max: 12 });
  try {
    const tables = await db.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
    assert.equal(
      tables.rowCount,
      0,
      "The disposable database must be empty; nothing will be dropped."
    );
    const directory = path.join(__dirname, "../migrations");
    for (const file of (await fs.readdir(directory))
      .filter((name) => name.endsWith(".sql"))
      .sort()) {
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
    await db.query("UPDATE ai_governance_settings SET provider_policies = $1::jsonb", [
      JSON.stringify([{ provider: "openai", enabled: true, allowedModels: ["test-model"], defaultModel: "test-model" }])
    ]);
    const config = {
      ...testConfig,
      aiPlannerEnabled: true,
      aiCredentialVaultEnabled: true,
      aiCredentialMasterKeys: { 1: Buffer.alloc(32, 7) }
    };
    let generatedPlan;
    const app = createApp({ db, config, aiPlanner: { preview: async () => generatedPlan } });
    const registered = await request(app).post("/api/auth/register").send({
      name: "Disposable QA",
      email: "isolated-qa@example.com",
      password: "disposable-qa-password"
    });
    assert.equal(registered.status, 201);
    const user = registered.body.data.user;
    const auth = { Authorization: `Bearer ${registered.body.data.accessToken}` };
    await request(app)
      .post("/api/ai/credentials")
      .set(auth)
      .send({ provider: "openai", credential: "disposable-test-provider-secret" })
      .expect(201);
    const projectResponse = await request(app)
      .post("/api/projects")
      .set(auth)
      .send({ key: "QAPG", name: "Isolated transaction QA" })
      .expect(201);
    const project = projectResponse.body.data;
    const fields = { title: "Rollback ticket", taskType: "task", status: "todo", priority: "low" };
    const preview = async (plan) => {
      generatedPlan = plan;
      const result = await request(app)
        .post(`/api/projects/${project.id}/ai-plan/preview`)
        .set(auth)
        .send({
          provider: "openai",
          model: "test-model",
          goal: "Verify real transaction semantics.",
          maxItems: 5
        });
      assert.equal(result.status, 200, JSON.stringify(result.body));
      return result.body.data.approval.id;
    };
    const apply = (body) =>
      request(app).post(`/api/projects/${project.id}/ai-plan/apply`).set(auth).send(body);
    await db.query(`CREATE FUNCTION qa_fail_criterion() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.body = 'Force rollback' THEN RAISE EXCEPTION 'QA injected failure'; END IF;
      RETURN NEW; END $$;
      CREATE TRIGGER qa_fail_criterion BEFORE INSERT ON task_acceptance_criteria
      FOR EACH ROW EXECUTE FUNCTION qa_fail_criterion();`);
    const failingPlan = aiPlannerSchemas.actionPlan.parse({
      summary: "Prove actual rollback",
      actions: [
        { id: "create", type: "task.create", tempId: "new:rollback", evidenceIds: [], fields },
        {
          id: "criterion",
          type: "criterion.add",
          taskRef: "new:rollback",
          evidenceIds: [],
          body: "Force rollback"
        }
      ]
    });
    const failingApproval = await preview(failingPlan);
    const failed = await apply({
      plan: failingPlan,
      approvalId: failingApproval,
      idempotencyKey: "qa-rollback"
    });
    assert.equal(failed.status, 500, JSON.stringify(failed.body));
    for (const table of ["tasks", "task_acceptance_criteria", "ai_plan_executions"]) {
      assert.equal(
        Number((await db.query(`SELECT COUNT(*) AS total FROM ${table}`)).rows[0].total),
        0
      );
    }
    const approval = (
      await db.query("SELECT * FROM ai_plan_approvals WHERE id = $1", [failingApproval])
    ).rows[0];
    assert.equal(approval.applied_at, null);
    console.log("PASS actual multi-action rollback and approval remains unused");

    const successPlan = aiPlannerSchemas.actionPlan.parse({
      summary: "One execution only",
      actions: [
        {
          id: "create",
          type: "task.create",
          tempId: "new:one",
          evidenceIds: [],
          fields: { ...fields, title: "Exactly once" }
        },
        {
          id: "criterion",
          type: "criterion.add",
          taskRef: "new:one",
          evidenceIds: [],
          body: "Exactly one criterion"
        }
      ]
    });
    const successfulApproval = await preview(successPlan);
    const body = {
      plan: successPlan,
      approvalId: successfulApproval,
      idempotencyKey: "qa-concurrent"
    };
    const responses = await Promise.all([apply(body), apply(body)]);
    assert.deepEqual(
      responses.map((response) => response.status),
      [200, 200]
    );
    assert.equal(responses.filter((response) => response.body.data.idempotent).length, 1);
    for (const table of ["tasks", "task_acceptance_criteria", "ai_plan_executions"]) {
      assert.equal(
        Number((await db.query(`SELECT COUNT(*) AS total FROM ${table}`)).rows[0].total),
        1
      );
    }
    console.log("PASS concurrent same-key approval: one execution, one ticket, one criterion");

    await db.query(
      `UPDATE ai_governance_settings SET provider_policies = $1::jsonb, daily_run_limit = 1`,
      [
        JSON.stringify([
          {
            provider: "openai",
            enabled: true,
            allowedModels: ["test-model"],
            defaultModel: "test-model"
          }
        ])
      ]
    );
    // Separate user: earlier mandatory-governance previews already consumed quota.
    const quotaUser = await request(app).post("/api/auth/register").send({
      name: "Disposable quota QA", email: "quota-qa@example.com",
      password: "disposable-qa-password"
    }).expect(201);
    const quotaUserId = quotaUser.body.data.user.id;
    const reservation = {
      config,
      userId: quotaUserId,
      provider: "openai",
      model: "test-model",
      promptCharacters: 100,
      maxItems: 1
    };
    const quotas = await Promise.allSettled(
      Array.from({ length: 5 }, () => reserveAiPreview(db, reservation))
    );
    assert.equal(quotas.filter((item) => item.status === "fulfilled").length, 1);
    assert.equal(
      quotas.filter(
        (item) => item.status === "rejected" && item.reason.code === "AI_DAILY_QUOTA_EXCEEDED"
      ).length,
      4
    );
    assert.equal((await db.query("SELECT run_count FROM ai_daily_usage WHERE user_id = $1", [quotaUserId])).rows[0].run_count, 1);
    console.log("PASS concurrent quota reservation: one allowed, four denied");
    console.log("PASS all migrations on real PostgreSQL; no external provider calls");
  } finally {
    await db.end();
  }
}

verify().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
