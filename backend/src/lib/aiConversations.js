const crypto = require("node:crypto");

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

const cleanText = (value, limit) =>
  String(value || "")
    .replace(/[\u0000-\u001F\u007F]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, limit);

const parseJson = (value, fallback) => {
  if (value == null) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return value;
};

// Keep the conversation diff shape stable for both legacy tasks and executor actions.
const proposalItems = (plan) => {
  if (Array.isArray(plan.actions)) {
    return plan.actions.map((action) => ({
      id: `action:${action.id}`,
      label:
        action.type === "task.create" ? action.fields.title : `${action.type}: ${action.taskRef}`,
      value: action
    }));
  }
  return plan.tasks.map((task) => ({
    id: `task:${task.tempId}`,
    label: task.title,
    value: task
  }));
};

const proposalDiff = (previousPlan, nextPlan) => {
  const nextItems = proposalItems(nextPlan);
  if (!previousPlan) {
    return { added: nextItems.map((item) => item.label), changed: [], removed: [] };
  }
  const previous = new Map(proposalItems(previousPlan).map((item) => [item.id, item]));
  const next = new Map(nextItems.map((item) => [item.id, item]));
  const changed = [];
  for (const [id, task] of next) {
    const before = previous.get(id);
    if (before && JSON.stringify(before.value) !== JSON.stringify(task.value)) {
      changed.push({ from: before.label, to: task.label });
    }
  }
  return {
    added: [...next.entries()].filter(([id]) => !previous.has(id)).map(([, task]) => task.label),
    changed,
    removed: [...previous.entries()].filter(([id]) => !next.has(id)).map(([, task]) => task.label)
  };
};

const summarizeEvidence = (plan, projectContext) => {
  const referenced = new Set(proposalItems(plan).flatMap((item) => item.value.evidenceIds || []));
  const items = projectContext.sources
    .filter((source) => referenced.has(source.id))
    .slice(0, 40)
    .map((source) => ({
      id: source.id,
      type: source.type,
      label: cleanText(source.label, 300),
      occurredAt: source.occurredAt || null
    }));
  return {
    taskCount: items.filter((item) => item.type === "task").length,
    githubCount: items.filter((item) => item.type === "github").length,
    items
  };
};

const expiresAfterDays = (days) => new Date(Date.now() + days * 86_400_000);

const scrubExpiredConversationDetails = async (db, projectId) => {
  await db.query(
    `UPDATE ai_conversation_messages
     SET content = NULL, content_sha256 = NULL
     WHERE content IS NOT NULL AND detail_expires_at <= CURRENT_TIMESTAMP
       AND conversation_id IN (SELECT id FROM ai_conversations WHERE project_id = $1)`,
    [projectId]
  );
  await db.query(
    `UPDATE ai_plan_approvals
     SET summary_hash = '0000000000000000000000000000000000000000000000000000000000000000',
         task_hashes = '{}'::jsonb
     WHERE proposal_revision_id IN (
       SELECT id FROM ai_proposal_revisions
       WHERE detail_expires_at <= CURRENT_TIMESTAMP
         AND conversation_id IN (SELECT id FROM ai_conversations WHERE project_id = $1)
     )`,
    [projectId]
  );
  await db.query(
    `UPDATE ai_proposal_revisions
     SET summary = NULL, plan = NULL, diff = NULL, evidence_summary = NULL
     WHERE plan IS NOT NULL AND detail_expires_at <= CURRENT_TIMESTAMP
       AND conversation_id IN (SELECT id FROM ai_conversations WHERE project_id = $1)`,
    [projectId]
  );
  await db.query(
    `UPDATE ai_conversations
     SET title = 'Expired conversation'
     WHERE project_id = $1 AND detail_expires_at <= CURRENT_TIMESTAMP
       AND title <> 'Expired conversation'`,
    [projectId]
  );
};

const purgeExpiredAiConversationDetails = async (db) => {
  await db.query(
    `UPDATE ai_conversation_messages
     SET content = NULL, content_sha256 = NULL
     WHERE content IS NOT NULL AND detail_expires_at <= CURRENT_TIMESTAMP`
  );
  await db.query(
    `UPDATE ai_plan_approvals
     SET summary_hash = '0000000000000000000000000000000000000000000000000000000000000000',
         task_hashes = '{}'::jsonb
     WHERE proposal_revision_id IN (
       SELECT id FROM ai_proposal_revisions WHERE detail_expires_at <= CURRENT_TIMESTAMP
     )`
  );
  await db.query(
    `UPDATE ai_proposal_revisions
     SET summary = NULL, plan = NULL, diff = NULL, evidence_summary = NULL
     WHERE plan IS NOT NULL AND detail_expires_at <= CURRENT_TIMESTAMP`
  );
  await db.query(
    `UPDATE ai_conversations
     SET title = 'Expired conversation'
     WHERE detail_expires_at <= CURRENT_TIMESTAMP AND title <> 'Expired conversation'`
  );
};

module.exports = {
  cleanText,
  expiresAfterDays,
  parseJson,
  purgeExpiredAiConversationDetails,
  proposalDiff,
  scrubExpiredConversationDetails,
  sha256,
  summarizeEvidence
};
