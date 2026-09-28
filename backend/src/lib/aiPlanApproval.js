const crypto = require("node:crypto");

const { AppError } = require("./errors");

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

const taskPayload = (task) => ({
  tempId: task.tempId,
  parentTempId: task.parentTempId || null,
  taskType: task.taskType,
  title: task.title,
  description: task.description || "",
  priority: task.priority || "medium",
  dueDate: task.dueDate || null,
  evidenceIds: task.evidenceIds || [],
  acceptanceCriteria: task.acceptanceCriteria || []
});

const taskFingerprint = (task) => sha256(JSON.stringify(taskPayload(task)));

const createAiPlanApproval = async (db, { userId, projectId, plan, ttlMinutes }) => {
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);
  const taskHashes = Object.fromEntries(
    plan.tasks.map((task) => [task.tempId, taskFingerprint(task)])
  );
  await db.query(
    `INSERT INTO ai_plan_approvals
       (id, user_id, project_id, summary_hash, task_hashes, expires_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
    [id, userId, projectId, sha256(plan.summary), JSON.stringify(taskHashes), expiresAt]
  );
  return { id, expiresAt: expiresAt.toISOString() };
};

const verifyAiPlanApproval = async (db, { approvalId, userId, projectId, plan }) => {
  const result = await db.query(
    `SELECT id, summary_hash, task_hashes, expires_at, applied_at
     FROM ai_plan_approvals
     WHERE id = $1 AND user_id = $2 AND project_id = $3
     FOR UPDATE`,
    [approvalId, userId, projectId]
  );
  const approval = result.rows[0];
  if (!approval) {
    throw new AppError(
      422,
      "AI_PLAN_APPROVAL_INVALID",
      "This plan was not approved for this project. Generate a new preview."
    );
  }
  if (approval.applied_at) {
    throw new AppError(
      409,
      "AI_PLAN_APPROVAL_USED",
      "This AI preview has already been applied. Generate a new preview."
    );
  }
  if (new Date(approval.expires_at).getTime() <= Date.now()) {
    throw new AppError(
      409,
      "AI_PLAN_APPROVAL_EXPIRED",
      "This AI preview has expired. Generate a new preview."
    );
  }

  const allowed =
    typeof approval.task_hashes === "string"
      ? JSON.parse(approval.task_hashes)
      : approval.task_hashes;
  const altered =
    sha256(plan.summary) !== approval.summary_hash ||
    plan.tasks.some(
      (task) => !allowed[task.tempId] || allowed[task.tempId] !== taskFingerprint(task)
    );
  if (altered) {
    throw new AppError(
      422,
      "AI_PLAN_APPROVAL_MISMATCH",
      "The selected plan differs from the reviewed preview. Generate a new preview."
    );
  }
};

const consumeAiPlanApproval = async (db, approvalId) => {
  await db.query("UPDATE ai_plan_approvals SET applied_at = CURRENT_TIMESTAMP WHERE id = $1", [
    approvalId
  ]);
};

module.exports = {
  consumeAiPlanApproval,
  createAiPlanApproval,
  taskFingerprint,
  verifyAiPlanApproval
};
