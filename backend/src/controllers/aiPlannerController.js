const {
  consumeAiPlanApproval,
  createAiPlanApproval,
  verifyAiPlanApproval
} = require("../lib/aiPlanApproval");
const {
  executeActionPlan,
  executeLegacyPlan,
  findCompletedActionExecution,
  reserveActionExecution
} = require("../lib/aiPlanExecutor");
const { AppError } = require("../lib/errors");
const { buildProjectAiContext } = require("../lib/aiProjectContext");
const { loadCredential } = require("../lib/aiCredentialVault");
const { getProjectRole } = require("../lib/projectAccess");

const loadEditableProject = async (db, projectId, userId) => {
  const role = await getProjectRole(db, projectId, userId);
  if (!role || !["owner", "editor"].includes(role)) {
    throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");
  }
  const result = await db.query(
    "SELECT id, key, name, description, archived_at FROM projects WHERE id = $1",
    [projectId]
  );
  const project = result.rows[0];
  if (!project) throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");
  if (project.archived_at) {
    throw new AppError(409, "PROJECT_ARCHIVED", "Restore this project before planning work.");
  }
  return project;
};

const validatePlanEvidence = async (db, projectId, plan) => {
  const entries = plan.tasks || plan.actions;
  const evidenceIds = [...new Set(entries.flatMap((entry) => entry.evidenceIds || []))];
  const taskIds = evidenceIds
    .filter((id) => id.startsWith("task:"))
    .map((id) => Number(id.slice(5)));
  const githubIds = evidenceIds
    .filter((id) => id.startsWith("github:"))
    .map((id) => Number(id.slice(7)));
  const valid = new Set();
  if (taskIds.length > 0) {
    const result = await db.query(
      `SELECT id FROM tasks
       WHERE project_id = $1 AND archived_at IS NULL AND id = ANY($2::int[])`,
      [projectId, taskIds]
    );
    result.rows.forEach((row) => valid.add(`task:${row.id}`));
  }
  if (githubIds.length > 0) {
    const result = await db.query(
      `SELECT gde.id
       FROM github_development_events gde
       JOIN project_github_repositories pgr ON pgr.repository_id = gde.repository_id
       WHERE pgr.project_id = $1 AND gde.id = ANY($2::bigint[])`,
      [projectId, githubIds]
    );
    result.rows.forEach((row) => valid.add(`github:${row.id}`));
  }
  if (evidenceIds.some((id) => !valid.has(id))) {
    throw new AppError(
      422,
      "AI_PLAN_EVIDENCE_INVALID",
      "The approved plan contains evidence outside this project. Generate a new preview."
    );
  }
};

const previewAiPlan = async (req, res) => {
  if (!req.app.locals.config.aiPlannerEnabled) {
    throw new AppError(
      503,
      "AI_PLANNER_DISABLED",
      "AI task planning is not enabled on this deployment."
    );
  }
  const project = await loadEditableProject(req.app.locals.db, req.params.id, req.user.id);
  const projectContext = await buildProjectAiContext(req.app.locals.db, {
    projectId: Number(project.id),
    options: req.body.contextOptions
  });
  const apiKey = await loadCredential(
    req.app.locals.db,
    { provider: req.body.provider, userId: req.user.id },
    req.app.locals.config
  );
  const plan = await req.app.locals.aiPlanner.preview({
    ...req.body,
    apiKey,
    project: { id: Number(project.id), name: project.name, description: project.description },
    projectContext
  });
  const normalizedExisting = new Map(
    projectContext.existingTasks.map((task) => [task.title.trim().toLowerCase(), task])
  );
  const proposals = plan.tasks
    ? plan.tasks.map((task) => ({ tempId: task.tempId, title: task.title }))
    : plan.actions
        .filter((action) => action.type === "task.create")
        .map((action) => ({
          actionId: action.id,
          tempId: action.tempId,
          title: action.fields.title
        }));
  const duplicates = proposals.flatMap((proposal) => {
    const existing = normalizedExisting.get(proposal.title.trim().toLowerCase());
    return existing ? [{ ...proposal, ...existing }] : [];
  });
  const approval = await createAiPlanApproval(req.app.locals.db, {
    userId: req.user.id,
    projectId: Number(project.id),
    plan,
    ttlMinutes: req.app.locals.config.aiPlanApprovalTtlMinutes
  });
  return res.status(200).json({
    data: {
      provider: req.body.provider,
      model: req.body.model,
      approval,
      plan,
      context: {
        ...projectContext.summary,
        sources: projectContext.sources,
        duplicates
      }
    }
  });
};

const applyAiPlan = async (req, res) => {
  if (!req.app.locals.config.aiPlannerEnabled) {
    throw new AppError(
      503,
      "AI_PLANNER_DISABLED",
      "AI task planning is not enabled on this deployment."
    );
  }
  const client = await req.app.locals.db.connect();
  try {
    await client.query("BEGIN");
    const project = await loadEditableProject(client, req.params.id, req.user.id);
    let reservation;
    try {
      await verifyAiPlanApproval(client, {
        approvalId: req.body.approvalId,
        userId: req.user.id,
        projectId: Number(project.id),
        plan: req.body.plan
      });
    } catch (error) {
      if (req.body.plan.actions && error.code === "AI_PLAN_APPROVAL_USED") {
        const replay = await findCompletedActionExecution(client, {
          approvalId: req.body.approvalId,
          idempotencyKey: req.body.idempotencyKey,
          userId: req.user.id,
          projectId: Number(project.id)
        });
        if (replay) {
          await client.query("COMMIT");
          return res.status(200).json({ data: { ...replay.response, idempotent: true } });
        }
      }
      throw error;
    }
    if (req.body.plan.actions) {
      reservation = await reserveActionExecution(client, {
        approvalId: req.body.approvalId,
        idempotencyKey: req.body.idempotencyKey,
        userId: req.user.id,
        projectId: Number(project.id)
      });
    }
    await validatePlanEvidence(client, project.id, req.body.plan);
    const result = req.body.plan.actions
      ? await executeActionPlan(client, {
          plan: req.body.plan,
          approvalId: req.body.approvalId,
          idempotencyKey: req.body.idempotencyKey,
          userId: req.user.id,
          project,
          reservation
        })
      : await executeLegacyPlan(client, {
          plan: req.body.plan,
          approvalId: req.body.approvalId,
          userId: req.user.id,
          project
        });
    await consumeAiPlanApproval(client, req.body.approvalId);
    await client.query("COMMIT");
    return res.status(req.body.plan.actions ? 200 : 201).json({ data: result });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

module.exports = { applyAiPlan, previewAiPlan };
