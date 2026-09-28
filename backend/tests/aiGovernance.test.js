const request = require("supertest");

const { auth, buildTestApp, registerUser } = require("./helpers/testApp");

const plan = {
  summary: "Govern AI planning safely.",
  tasks: [
    {
      tempId: "task-governance",
      parentTempId: null,
      taskType: "task",
      title: "Verify governed planning",
      description: "Exercise the configured provider boundary.",
      priority: "medium",
      dueDate: null,
      evidenceIds: [],
      acceptanceCriteria: ["Governance is enforced before the provider is called."]
    }
  ]
};

const settings = {
  providerPolicies: [
    {
      provider: "openai",
      enabled: true,
      allowedModels: ["gpt-test"],
      defaultModel: "gpt-test"
    },
    {
      provider: "anthropic",
      enabled: false,
      allowedModels: [],
      defaultModel: null
    },
    {
      provider: "google",
      enabled: false,
      allowedModels: [],
      defaultModel: null
    }
  ],
  dailyRunLimit: 1,
  maxPromptCharacters: 30000,
  maxOutputTokens: 5000,
  maxProposedActions: 10,
  requestTimeoutMs: 30000,
  retentionDays: 30
};

describe("AI governance", () => {
  let app;
  let db;
  let planner;
  let owner;
  let project;

  beforeEach(async () => {
    planner = { preview: globalThis.vi.fn().mockResolvedValue(plan) };
    ({ app, db } = await buildTestApp({
      config: { aiPlannerEnabled: true, aiGovernanceEnabled: true },
      aiPlanner: planner
    }));
    owner = await registerUser(app, "governance-owner");
    await db.query("UPDATE users SET role = 'platform_owner' WHERE id = $1", [owner.user.id]);
    project = (
      await request(app)
        .post("/api/projects")
        .set(auth(owner.token))
        .send({ key: "GOV", name: "Governed AI", description: "Safe AI operations" })
    ).body.data;
  });

  afterEach(async () => db.end());

  const saveSettings = () =>
    request(app).put("/api/admin/ai-governance").set(auth(owner.token)).send(settings);

  const preview = (overrides = {}) =>
    request(app)
      .post(`/api/projects/${project.id}/ai-plan/preview`)
      .set(auth(owner.token))
      .send({
        provider: "openai",
        apiKey: "request-only-provider-secret",
        model: "gpt-test",
        goal: "Create a governed implementation plan for this project.",
        maxItems: 5,
        ...overrides
      });

  it("lets only the platform owner configure bounded provider and model policy", async () => {
    const admin = await registerUser(app, "governance-admin");
    await db.query("UPDATE users SET role = 'admin' WHERE id = $1", [admin.user.id]);

    const denied = await request(app)
      .put("/api/admin/ai-governance")
      .set(auth(admin.token))
      .send(settings);
    const saved = await saveSettings();
    const audit = await db.query(
      "SELECT action, details FROM admin_audit_log WHERE action = 'ai_governance_updated'"
    );

    expect(denied.status).toBe(403);
    expect(saved.status).toBe(200);
    expect(saved.body.data.settings.providerPolicies[0]).toMatchObject({
      provider: "openai",
      enabled: true,
      allowedModels: ["gpt-test"]
    });
    expect(saved.body.data.settings.serverCeilings.dailyRunLimit).toBe(100);
    expect(audit.rows).toHaveLength(1);
    expect(JSON.stringify(audit.rows)).not.toContain("request-only-provider-secret");
  });

  it("rejects settings above server-defined ceilings", async () => {
    const response = await request(app)
      .put("/api/admin/ai-governance")
      .set(auth(owner.token))
      .send({ ...settings, dailyRunLimit: 101 });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("AI_GOVERNANCE_CEILING_EXCEEDED");
  });

  it("enforces provider, model, action, and daily-run limits before provider calls", async () => {
    await saveSettings();
    const disabled = await preview({ provider: "anthropic", model: "claude-test" });
    const unlisted = await preview({ model: "gpt-unlisted" });
    const tooMany = await preview({ maxItems: 11 });
    const allowed = await preview();
    const overQuota = await preview();

    expect(disabled.body.error.code).toBe("AI_PROVIDER_DISABLED");
    expect(unlisted.body.error.code).toBe("AI_MODEL_NOT_ALLOWED");
    expect(tooMany.body.error.code).toBe("AI_ACTION_LIMIT_EXCEEDED");
    expect(allowed.status).toBe(200);
    expect(overQuota.status).toBe(429);
    expect(overQuota.body.error.code).toBe("AI_DAILY_QUOTA_EXCEEDED");
    expect(planner.preview).toHaveBeenCalledTimes(1);
  });

  it("records sanitized usage and provider health without prompts or credentials", async () => {
    await saveSettings();
    const response = await preview();
    const usageRows = (await db.query("SELECT * FROM ai_usage_events")).rows;
    const dailyRows = (await db.query("SELECT * FROM ai_daily_usage")).rows;
    const overview = await request(app).get("/api/admin/ai-governance").set(auth(owner.token));
    const serialized = JSON.stringify({ usageRows, dailyRows, body: overview.body });

    expect(response.status).toBe(200);
    expect(usageRows).toHaveLength(1);
    expect(usageRows[0]).toMatchObject({
      provider: "openai",
      model: "gpt-test",
      outcome: "succeeded"
    });
    expect(dailyRows[0].run_count).toBe(1);
    expect(overview.body.data.usage).toMatchObject({ totalRuns: 1, succeededRuns: 1 });
    expect(
      overview.body.data.usage.providerHealth.find((item) => item.provider === "openai")
    ).toMatchObject({ status: "healthy", succeeded: 1, failed: 0 });
    expect(serialized).not.toContain("request-only-provider-secret");
    expect(serialized).not.toContain("Create a governed implementation plan");
  });

  it("records only a sanitized provider failure code", async () => {
    await saveSettings();
    const error = Object.assign(new Error("Authorization: Bearer secret-provider-key"), {
      code: "AI_PROVIDER_UNAVAILABLE",
      status: 502
    });
    planner.preview.mockRejectedValueOnce(error);
    const response = await preview();
    const rows = (await db.query("SELECT * FROM ai_usage_events")).rows;

    expect(response.status).toBe(502);
    expect(rows[0]).toMatchObject({ outcome: "failed", error_code: "AI_PROVIDER_UNAVAILABLE" });
    expect(JSON.stringify(rows)).not.toContain("secret-provider-key");
  });
});
