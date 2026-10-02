const request = require("supertest");

const { purgeExpiredAiConversationDetails } = require("../src/lib/aiConversations");
const { createAiPlanner } = require("../src/lib/aiPlanner");
const { auth, buildTestApp, registerUser } = require("./helpers/testApp");

const firstPlan = {
  summary: "Deliver a persistent planning workspace.",
  tasks: [
    {
      tempId: "workspace",
      parentTempId: null,
      taskType: "task",
      title: "Build the conversation workspace",
      description: "Show proposals and their evidence.",
      priority: "medium",
      dueDate: null,
      evidenceIds: [],
      acceptanceCriteria: ["Proposal history remains reviewable."]
    }
  ]
};

const secondPlan = {
  summary: "Deliver a persistent and secure planning workspace.",
  tasks: [
    { ...firstPlan.tasks[0], title: "Build the secure conversation workspace" },
    {
      tempId: "retention",
      parentTempId: null,
      taskType: "task",
      title: "Scrub expired planning details",
      description: "Keep only non-secret audit metadata after retention.",
      priority: "high",
      dueDate: "2026-10-15",
      evidenceIds: [],
      acceptanceCriteria: ["Message and proposal content is removed after retention."]
    }
  ]
};

describe("AI conversations", () => {
  let app;
  let db;
  let planner;
  let owner;
  let project;

  beforeEach(async () => {
    planner = { preview: globalThis.vi.fn().mockResolvedValue(firstPlan) };
    ({ app, db } = await buildTestApp({
      config: {
        aiPlannerEnabled: true,
        aiCredentialVaultEnabled: true,
        aiCredentialMasterKeys: { 1: Buffer.alloc(32, 7) },
        aiCredentialActiveKeyVersion: 1
      },
      aiPlanner: planner
    }));
    owner = await registerUser(app, "conversation-owner");
    await request(app)
      .post("/api/ai/credentials")
      .set(auth(owner.token))
      .send({ provider: "openai", credential: "saved-conversation-provider-secret" });
    project = (
      await request(app)
        .post("/api/projects")
        .set(auth(owner.token))
        .send({ key: "AIC", name: "AI Conversations", description: "Persistent planning" })
    ).body.data;
  });

  afterEach(async () => db.end());

  const createConversation = async () =>
    request(app)
      .post(`/api/projects/${project.id}/ai-conversations`)
      .set(auth(owner.token))
      .send({ title: "Release plan", provider: "openai", model: "test-model" });

  const runConversation = async (conversationId) =>
    request(app)
      .post(`/api/projects/${project.id}/ai-conversations/${conversationId}/runs`)
      .set(auth(owner.token))
      .send({
        goal: "Create a persistent and secure planning workflow.",
        context: "Do not persist the credential.",
        maxItems: 8,
        contextOptions: {
          includeProjectTasks: true,
          includeGithubActivity: false,
          repositoryIds: []
        }
      });

  it("pins provider and model, persists a versioned proposal, and never stores the key", async () => {
    const created = await createConversation();
    const conversationId = created.body.data.id;
    const run = await runConversation(conversationId);

    expect(created.status).toBe(201);
    expect(run.status).toBe(201);
    const listed = await request(app)
      .get(`/api/projects/${project.id}/ai-conversations`)
      .set(auth(owner.token));
    expect(listed.status).toBe(200);
    expect(listed.body.data[0]).toMatchObject({
      id: conversationId,
      title: "Release plan",
      provider: "openai",
      runCount: 1,
      proposalCount: 1
    });
    expect(run.body.data.proposal).toMatchObject({
      revisionNumber: 1,
      canApprove: true,
      plan: firstPlan
    });
    expect(planner.preview).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "openai",
        model: "test-model",
        apiKey: "saved-conversation-provider-secret"
      })
    );
    const persisted = await Promise.all([
      db.query("SELECT * FROM ai_conversations"),
      db.query("SELECT * FROM ai_conversation_messages"),
      db.query("SELECT * FROM ai_conversation_runs"),
      db.query("SELECT * FROM ai_proposal_revisions"),
      db.query("SELECT * FROM ai_plan_approvals")
    ]);
    expect(JSON.stringify(persisted.map((result) => result.rows))).not.toContain(
      "saved-conversation-provider-secret"
    );
  });

  it("fails closed when planning is disabled", async () => {
    const conversationId = (await createConversation()).body.data.id;
    app.locals.config.aiPlannerEnabled = false;
    const run = await runConversation(conversationId);
    expect(run.status).toBe(503);
    expect(run.body.error.code).toBe("AI_PLANNER_DISABLED");
    expect(planner.preview).not.toHaveBeenCalled();
  });

  it("records missing credentials as a failed run without creating work", async () => {
    const conversationId = (await createConversation()).body.data.id;
    await db.query("DELETE FROM ai_provider_credentials WHERE user_id = $1", [owner.user.id]);
    const run = await runConversation(conversationId);
    expect(run.status).toBe(409);
    expect(planner.preview).not.toHaveBeenCalled();
    const runs = await db.query(
      "SELECT status FROM ai_conversation_runs WHERE conversation_id = $1",
      [conversationId]
    );
    expect(runs.rows[0].status).toBe("failed");
    const tasks = await db.query("SELECT id FROM tasks WHERE project_id = $1", [project.id]);
    expect(tasks.rows).toHaveLength(0);
  });

  it("records invalid provider plans safely and permits a valid manually requested revision", async () => {
    const conversationId = (await createConversation()).body.data.id;
    app.locals.aiPlanner = createAiPlanner({ ...app.locals.config, aiPlannerTimeoutMs: 1000 });
    const invalidPlan = {
      ...firstPlan,
      tasks: [{ ...firstPlan.tasks[0], parentTempId: "AIC-123" }]
    };
    const output = (plan) =>
      new Response(
        JSON.stringify({
          output: [{ content: [{ type: "output_text", text: JSON.stringify(plan) }] }]
        })
      );
    const fetchMock = globalThis.vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(output(invalidPlan))
      .mockResolvedValueOnce(output(firstPlan));
    try {
      const failed = await runConversation(conversationId);
      expect(failed.status).toBe(502);
      expect(failed.body.error).toMatchObject({
        code: "AI_PLAN_INVALID",
        details: {
          stage: "schema_validation",
          issues: [{ path: "tasks.0.parentTempId", code: "custom" }]
        }
      });
      expect(failed.body.error.message).toContain("No tickets were created");
      expect((await db.query("SELECT * FROM tasks")).rows).toHaveLength(0);
      expect((await db.query("SELECT * FROM ai_proposal_revisions")).rows).toHaveLength(0);
      expect((await db.query("SELECT * FROM ai_plan_approvals")).rows).toHaveLength(0);
      expect(
        (await db.query("SELECT status, error_code FROM ai_conversation_runs")).rows[0]
      ).toMatchObject({ status: "failed", error_code: "AI_PLAN_INVALID" });
      expect(
        JSON.stringify((await db.query("SELECT * FROM ai_conversation_messages")).rows)
      ).not.toContain("AIC-123");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const valid = await runConversation(conversationId);
      expect(valid.status).toBe(201);
      expect(valid.body.data.proposal).toMatchObject({ revisionNumber: 1, canApprove: true });
      expect((await db.query("SELECT * FROM tasks")).rows).toHaveLength(0);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("supersedes earlier revisions and only allows the latest proposal to apply", async () => {
    const conversationId = (await createConversation()).body.data.id;
    const first = await runConversation(conversationId);
    planner.preview.mockResolvedValueOnce(secondPlan);
    const second = await runConversation(conversationId);

    expect(planner.preview).toHaveBeenLastCalledWith(
      expect.objectContaining({ context: expect.stringContaining("Prior conversation history") })
    );

    const oldApply = await request(app)
      .post(`/api/projects/${project.id}/ai-plan/apply`)
      .set(auth(owner.token))
      .send({ approvalId: first.body.data.proposal.approvalId, plan: firstPlan });
    const latestApply = await request(app)
      .post(`/api/projects/${project.id}/ai-plan/apply`)
      .set(auth(owner.token))
      .send({ approvalId: second.body.data.proposal.approvalId, plan: secondPlan });
    const detail = await request(app)
      .get(`/api/projects/${project.id}/ai-conversations/${conversationId}`)
      .set(auth(owner.token));

    expect(oldApply.status).toBe(409);
    expect(oldApply.body.error.code).toBe("AI_PROPOSAL_SUPERSEDED");
    expect(latestApply.status).toBe(201);
    expect(detail.body.data.proposals).toHaveLength(2);
    expect(detail.body.data.proposals[0]).toMatchObject({
      revisionNumber: 2,
      state: "applied",
      canApprove: false,
      diff: {
        added: ["Scrub expired planning details"],
        changed: [
          {
            from: "Build the conversation workspace",
            to: "Build the secure conversation workspace"
          }
        ],
        removed: []
      }
    });
    expect(detail.body.data.proposals[1].state).toBe("superseded");
  });

  it("allows project viewers to read history but not create or run conversations", async () => {
    const conversationId = (await createConversation()).body.data.id;
    const viewer = await registerUser(app, "conversation-viewer");
    await request(app)
      .post(`/api/projects/${project.id}/members`)
      .set(auth(owner.token))
      .send({ email: viewer.user.email, role: "viewer" });

    const detail = await request(app)
      .get(`/api/projects/${project.id}/ai-conversations/${conversationId}`)
      .set(auth(viewer.token));
    const create = await request(app)
      .post(`/api/projects/${project.id}/ai-conversations`)
      .set(auth(viewer.token))
      .send({ title: "Denied", provider: "google", model: "test-model" });

    expect(detail.status).toBe(200);
    expect(create.status).toBe(404);
  });

  it("discards a pending proposal and rejects later approval", async () => {
    const conversationId = (await createConversation()).body.data.id;
    const run = await runConversation(conversationId);
    const proposal = run.body.data.proposal;
    const discarded = await request(app)
      .post(
        `/api/projects/${project.id}/ai-conversations/${conversationId}/proposals/${proposal.id}/discard`
      )
      .set(auth(owner.token));
    const apply = await request(app)
      .post(`/api/projects/${project.id}/ai-plan/apply`)
      .set(auth(owner.token))
      .send({ approvalId: proposal.approvalId, plan: firstPlan });

    expect(discarded.status).toBe(200);
    expect(apply.status).toBe(409);
    expect(apply.body.error.code).toBe("AI_PROPOSAL_SUPERSEDED");
  });

  it("scrubs 15-day detail while retaining non-secret run audit metadata", async () => {
    const conversationId = (await createConversation()).body.data.id;
    await runConversation(conversationId);
    const expired = new Date(Date.now() - 60_000);
    await db.query(
      "UPDATE ai_conversation_messages SET detail_expires_at = $1 WHERE conversation_id = $2",
      [expired, conversationId]
    );
    await db.query(
      "UPDATE ai_proposal_revisions SET detail_expires_at = $1 WHERE conversation_id = $2",
      [expired, conversationId]
    );
    await db.query("UPDATE ai_conversations SET detail_expires_at = $1 WHERE id = $2", [
      expired,
      conversationId
    ]);
    await purgeExpiredAiConversationDetails(db);

    const detail = await request(app)
      .get(`/api/projects/${project.id}/ai-conversations/${conversationId}`)
      .set(auth(owner.token));

    expect(detail.status).toBe(200);
    expect(detail.body.data.conversation.title).toBe("Expired conversation");
    expect(detail.body.data.messages.every((message) => message.content === null)).toBe(true);
    expect(detail.body.data.messages.every((message) => message.contentSha256 === null)).toBe(true);
    expect(detail.body.data.proposals[0]).toMatchObject({
      plan: null,
      diff: null,
      evidenceSummary: null,
      expired: true,
      canApprove: false
    });
    expect(detail.body.data.runs[0]).toMatchObject({
      status: "completed",
      provider: "openai",
      model: "test-model"
    });
    const approval = (await db.query("SELECT summary_hash, task_hashes FROM ai_plan_approvals"))
      .rows[0];
    expect(approval.summary_hash).toBe("0".repeat(64));
    expect(approval.task_hashes).toEqual({});
  });
});
