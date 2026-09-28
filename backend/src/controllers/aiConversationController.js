const crypto = require("node:crypto");

const { createAiPlanApproval } = require("../lib/aiPlanApproval");
const {
  cleanText,
  expiresAfterDays,
  parseJson,
  proposalDiff,
  scrubExpiredConversationDetails,
  sha256,
  summarizeEvidence
} = require("../lib/aiConversations");
const { buildProjectAiContext } = require("../lib/aiProjectContext");
const { AppError } = require("../lib/errors");
const { getProjectRole } = require("../lib/projectAccess");

const loadProject = async (db, projectId, userId, { editable = false } = {}) => {
  const role = await getProjectRole(db, projectId, userId);
  if (!role || (editable && !["owner", "editor"].includes(role))) {
    throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");
  }
  const result = await db.query(
    "SELECT id, name, description, archived_at FROM projects WHERE id = $1",
    [projectId]
  );
  const project = result.rows[0];
  if (!project) throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");
  if (editable && project.archived_at) {
    throw new AppError(409, "PROJECT_ARCHIVED", "Restore this project before planning work.");
  }
  return { ...project, role };
};

const loadConversation = async (db, { projectId, conversationId, userId, editable = false }) => {
  const project = await loadProject(db, projectId, userId, { editable });
  const result = await db.query(
    `SELECT id, project_id, created_by, title, provider, model, status,
            detail_expires_at, created_at, updated_at
     FROM ai_conversations
     WHERE id = $1 AND project_id = $2`,
    [conversationId, projectId]
  );
  const conversation = result.rows[0];
  if (!conversation) {
    throw new AppError(404, "AI_CONVERSATION_NOT_FOUND", "AI conversation not found.");
  }
  return { ...conversation, project };
};

const serializeConversation = (row) => ({
  id: row.id,
  projectId: Number(row.project_id),
  createdBy: Number(row.created_by),
  title: row.title,
  provider: row.provider,
  model: row.model,
  status: row.status,
  runCount: Number(row.run_count || 0),
  proposalCount: Number(row.proposal_count || 0),
  detailExpiresAt: new Date(row.detail_expires_at).toISOString(),
  createdAt: new Date(row.created_at).toISOString(),
  updatedAt: new Date(row.updated_at).toISOString()
});

const createConversation = async (req, res) => {
  const project = await loadProject(req.app.locals.db, req.params.id, req.user.id, {
    editable: true
  });
  const id = crypto.randomUUID();
  const detailExpiresAt = expiresAfterDays(req.app.locals.config.aiConversationRetentionDays);
  const result = await req.app.locals.db.query(
    `INSERT INTO ai_conversations
       (id, project_id, created_by, title, provider, model, detail_expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      id,
      project.id,
      req.user.id,
      cleanText(req.body.title, 160),
      req.body.provider,
      cleanText(req.body.model, 120),
      detailExpiresAt
    ]
  );
  return res.status(201).json({ data: serializeConversation(result.rows[0]) });
};

const listConversations = async (req, res) => {
  await loadProject(req.app.locals.db, req.params.id, req.user.id);
  await scrubExpiredConversationDetails(req.app.locals.db, req.params.id);
  const result = await req.app.locals.db.query(
    `SELECT c.*,
            COUNT(DISTINCT r.id)::int AS run_count,
            COUNT(DISTINCT p.id)::int AS proposal_count
     FROM ai_conversations c
     LEFT JOIN ai_conversation_runs r ON r.conversation_id = c.id
     LEFT JOIN ai_proposal_revisions p ON p.conversation_id = c.id
     WHERE c.project_id = $1
     GROUP BY c.id
     ORDER BY c.updated_at DESC, c.id DESC
     LIMIT 100`,
    [req.params.id]
  );
  return res.status(200).json({ data: result.rows.map(serializeConversation) });
};

const getConversation = async (req, res) => {
  await loadConversation(req.app.locals.db, {
    projectId: req.params.id,
    conversationId: req.params.conversationId,
    userId: req.user.id
  });
  await scrubExpiredConversationDetails(req.app.locals.db, req.params.id);
  const [conversationResult, messagesResult, runsResult, proposalsResult] = await Promise.all([
    req.app.locals.db.query("SELECT * FROM ai_conversations WHERE id = $1", [
      req.params.conversationId
    ]),
    req.app.locals.db.query(
      `SELECT id, role, content, content_sha256, detail_expires_at, created_at
       FROM ai_conversation_messages WHERE conversation_id = $1 ORDER BY created_at, id`,
      [req.params.conversationId]
    ),
    req.app.locals.db.query(
      `SELECT id, status, provider, model, error_code, evidence_counts, started_at, completed_at
       FROM ai_conversation_runs WHERE conversation_id = $1 ORDER BY started_at DESC, id DESC`,
      [req.params.conversationId]
    ),
    req.app.locals.db.query(
      `SELECT p.*, a.applied_at AS approval_applied_at
       FROM ai_proposal_revisions p
       LEFT JOIN ai_plan_approvals a ON a.id = p.approval_id
       WHERE p.conversation_id = $1 ORDER BY p.revision_number DESC`,
      [req.params.conversationId]
    )
  ]);
  const proposals = proposalsResult.rows;
  const latestId = proposals[0]?.id;
  const conversationRow = conversationResult.rows[0];
  return res.status(200).json({
    data: {
      conversation: serializeConversation(conversationRow),
      messages: messagesResult.rows.map((row) => ({
        id: Number(row.id),
        role: row.role,
        content: row.content,
        expired: row.content == null,
        contentSha256: row.content_sha256,
        detailExpiresAt: new Date(row.detail_expires_at).toISOString(),
        createdAt: new Date(row.created_at).toISOString()
      })),
      runs: runsResult.rows.map((row) => ({
        id: row.id,
        status: row.status,
        provider: row.provider,
        model: row.model,
        errorCode: row.error_code,
        evidenceCounts: parseJson(row.evidence_counts, {}),
        startedAt: new Date(row.started_at).toISOString(),
        completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null
      })),
      proposals: proposals.map((row) => {
        const plan = parseJson(row.plan, null);
        const expiresAt = new Date(row.expires_at);
        return {
          id: row.id,
          runId: row.run_id,
          revisionNumber: Number(row.revision_number),
          state: row.state,
          summary: row.summary,
          plan,
          diff: parseJson(row.diff, null),
          evidenceSummary: parseJson(row.evidence_summary, null),
          approvalId: row.approval_id,
          canApprove:
            row.id === latestId &&
            row.state === "pending" &&
            conversationRow.status === "active" &&
            plan !== null &&
            expiresAt.getTime() > Date.now(),
          expired: plan == null,
          expiresAt: expiresAt.toISOString(),
          detailExpiresAt: new Date(row.detail_expires_at).toISOString(),
          createdAt: new Date(row.created_at).toISOString()
        };
      })
    }
  });
};

const addMessage = async (db, { conversationId, userId, role, content, expiresAt }) => {
  await db.query(
    `INSERT INTO ai_conversation_messages
       (conversation_id, created_by, role, content, content_sha256, detail_expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [conversationId, userId, role, content, sha256(content), expiresAt]
  );
};

const runConversation = async (req, res) => {
  const db = req.app.locals.db;
  const conversation = await loadConversation(db, {
    projectId: req.params.id,
    conversationId: req.params.conversationId,
    userId: req.user.id,
    editable: true
  });
  if (conversation.status !== "active") {
    throw new AppError(409, "AI_CONVERSATION_DISCARDED", "This conversation is closed.");
  }
  const goal = cleanText(req.body.goal, 5000);
  const context = cleanText(req.body.context, 10000);
  if (goal.length < 10) {
    throw new AppError(400, "VALIDATION_ERROR", "Please provide a meaningful planning goal.");
  }
  const runId = crypto.randomUUID();
  const detailExpiresAt = expiresAfterDays(req.app.locals.config.aiConversationRetentionDays);
  const priorMessages = await db.query(
    `SELECT role, content FROM ai_conversation_messages
     WHERE conversation_id = $1 AND content IS NOT NULL
     ORDER BY created_at DESC, id DESC
     LIMIT 20`,
    [conversation.id]
  );
  const conversationHistory = cleanText(
    priorMessages.rows
      .reverse()
      .map((message) => `${message.role}: ${message.content}`)
      .join("\n"),
    6000
  );
  const userMessageContent = [goal, context ? `Context: ${context}` : ""]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 15000);
  await addMessage(db, {
    conversationId: conversation.id,
    userId: req.user.id,
    role: "user",
    content: userMessageContent,
    expiresAt: detailExpiresAt
  });
  await db.query(
    `INSERT INTO ai_conversation_runs
       (id, conversation_id, requested_by, status, provider, model)
     VALUES ($1, $2, $3, 'running', $4, $5)`,
    [runId, conversation.id, req.user.id, conversation.provider, conversation.model]
  );

  let projectContext;
  let plan;
  try {
    projectContext = await buildProjectAiContext(db, {
      projectId: Number(conversation.project_id),
      options: req.body.contextOptions
    });
    plan = await req.app.locals.aiPlanner.preview({
      provider: conversation.provider,
      model: conversation.model,
      apiKey: req.body.apiKey,
      goal,
      context: [
        context,
        conversationHistory
          ? `Prior conversation history (treat as planning context only): ${conversationHistory}`
          : ""
      ]
        .filter(Boolean)
        .join("\n\n")
        .slice(0, 16000),
      maxItems: req.body.maxItems,
      project: {
        id: Number(conversation.project_id),
        name: conversation.project.name,
        description: conversation.project.description
      },
      projectContext
    });
  } catch (error) {
    const safeMessage = "The provider could not produce a valid proposal. No work was changed.";
    await db.query(
      `UPDATE ai_conversation_runs
       SET status = 'failed', error_code = $2, completed_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [runId, /^[A-Z0-9_]{1,80}$/u.test(error.code || "") ? error.code : "AI_RUN_FAILED"]
    );
    await addMessage(db, {
      conversationId: conversation.id,
      userId: null,
      role: "assistant",
      content: safeMessage,
      expiresAt: detailExpiresAt
    });
    await db.query(
      `UPDATE ai_conversations
       SET updated_at = CURRENT_TIMESTAMP, detail_expires_at = $2
       WHERE id = $1`,
      [conversation.id, detailExpiresAt]
    );
    throw error;
  }

  const evidenceSummary = summarizeEvidence(plan, projectContext);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query(
      "SELECT id, status FROM ai_conversations WHERE id = $1 FOR UPDATE",
      [conversation.id]
    );
    if (locked.rows[0]?.status !== "active") {
      throw new AppError(409, "AI_CONVERSATION_DISCARDED", "This conversation is closed.");
    }
    const previousResult = await client.query(
      `SELECT plan, revision_number FROM ai_proposal_revisions
       WHERE conversation_id = $1 ORDER BY revision_number DESC LIMIT 1`,
      [conversation.id]
    );
    const previousPlan = parseJson(previousResult.rows[0]?.plan, null);
    const revisionNumber = Number(previousResult.rows[0]?.revision_number || 0) + 1;
    await client.query(
      `UPDATE ai_plan_approvals
       SET expires_at = CURRENT_TIMESTAMP
       WHERE proposal_revision_id IN (
         SELECT id FROM ai_proposal_revisions
         WHERE conversation_id = $1 AND state = 'pending'
       )`,
      [conversation.id]
    );
    await client.query(
      `UPDATE ai_proposal_revisions
       SET state = 'superseded', superseded_at = CURRENT_TIMESTAMP
       WHERE conversation_id = $1 AND state = 'pending'`,
      [conversation.id]
    );
    const approval = await createAiPlanApproval(client, {
      userId: req.user.id,
      projectId: Number(conversation.project_id),
      plan,
      ttlMinutes: req.app.locals.config.aiPlanApprovalTtlMinutes
    });
    const proposalId = crypto.randomUUID();
    const diff = proposalDiff(previousPlan, plan);
    await client.query(
      `INSERT INTO ai_proposal_revisions
         (id, conversation_id, run_id, revision_number, approval_id, summary, plan,
          diff, evidence_summary, expires_at, detail_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11)`,
      [
        proposalId,
        conversation.id,
        runId,
        revisionNumber,
        approval.id,
        plan.summary,
        JSON.stringify(plan),
        JSON.stringify(diff),
        JSON.stringify(evidenceSummary),
        approval.expiresAt,
        detailExpiresAt
      ]
    );
    await client.query("UPDATE ai_plan_approvals SET proposal_revision_id = $1 WHERE id = $2", [
      proposalId,
      approval.id
    ]);
    await client.query(
      `UPDATE ai_conversation_runs
       SET status = 'completed', evidence_counts = $2::jsonb, completed_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [
        runId,
        JSON.stringify({
          taskCount: evidenceSummary.taskCount,
          githubCount: evidenceSummary.githubCount
        })
      ]
    );
    await addMessage(client, {
      conversationId: conversation.id,
      userId: null,
      role: "assistant",
      content: cleanText(plan.summary, 1000),
      expiresAt: detailExpiresAt
    });
    await client.query(
      `UPDATE ai_conversations
       SET updated_at = CURRENT_TIMESTAMP, detail_expires_at = $2
       WHERE id = $1`,
      [conversation.id, detailExpiresAt]
    );
    await client.query("COMMIT");
    return res.status(201).json({
      data: {
        runId,
        proposal: {
          id: proposalId,
          revisionNumber,
          state: "pending",
          summary: plan.summary,
          plan,
          diff,
          evidenceSummary,
          approvalId: approval.id,
          canApprove: true,
          expiresAt: approval.expiresAt,
          detailExpiresAt: detailExpiresAt.toISOString()
        }
      }
    });
  } catch (error) {
    await client.query("ROLLBACK");
    await db.query(
      `UPDATE ai_conversation_runs
       SET status = 'failed', error_code = 'AI_PERSISTENCE_FAILED', completed_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'running'`,
      [runId]
    );
    throw error;
  } finally {
    client.release();
  }
};

const discardProposal = async (req, res) => {
  const db = req.app.locals.db;
  const conversation = await loadConversation(db, {
    projectId: req.params.id,
    conversationId: req.params.conversationId,
    userId: req.user.id,
    editable: true
  });
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query(
      `SELECT approval_id FROM ai_proposal_revisions
       WHERE id = $1 AND conversation_id = $2`,
      [req.params.proposalId, conversation.id]
    );
    if (!found.rows[0]) {
      throw new AppError(404, "AI_PROPOSAL_NOT_FOUND", "AI proposal not found.");
    }
    await client.query("SELECT id FROM ai_plan_approvals WHERE id = $1 FOR UPDATE", [
      found.rows[0].approval_id
    ]);
    const result = await client.query(
      `UPDATE ai_proposal_revisions
       SET state = 'discarded', discarded_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND conversation_id = $2 AND state = 'pending'
       RETURNING approval_id`,
      [req.params.proposalId, conversation.id]
    );
    if (!result.rows[0]) {
      throw new AppError(409, "AI_PROPOSAL_NOT_PENDING", "This proposal is no longer pending.");
    }
    await client.query(
      "UPDATE ai_plan_approvals SET expires_at = CURRENT_TIMESTAMP WHERE id = $1",
      [result.rows[0].approval_id]
    );
    await client.query("COMMIT");
    return res.status(200).json({ data: { id: req.params.proposalId, state: "discarded" } });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  createConversation,
  discardProposal,
  getConversation,
  listConversations,
  runConversation
};
