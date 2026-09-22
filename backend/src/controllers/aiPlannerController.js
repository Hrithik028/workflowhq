const { logActivity } = require("../lib/activity");
const { readWorkspaceRules } = require("../lib/accessControl");
const { AppError } = require("../lib/errors");
const { buildProjectAiContext } = require("../lib/aiProjectContext");
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

const validatePlanEvidence = async (db, projectId, tasks) => {
  const evidenceIds = [...new Set(tasks.flatMap((task) => task.evidenceIds))];
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
  const project = await loadEditableProject(req.app.locals.db, req.params.id, req.user.id);
  const projectContext = await buildProjectAiContext(req.app.locals.db, {
    projectId: Number(project.id),
    options: req.body.contextOptions
  });
  const plan = await req.app.locals.aiPlanner.preview({
    ...req.body,
    project: { id: Number(project.id), name: project.name, description: project.description },
    projectContext
  });
  const normalizedExisting = new Map(
    projectContext.existingTasks.map((task) => [task.title.trim().toLowerCase(), task])
  );
  const duplicates = plan.tasks.flatMap((task) => {
    const existing = normalizedExisting.get(task.title.trim().toLowerCase());
    return existing ? [{ tempId: task.tempId, ...existing }] : [];
  });
  return res.status(200).json({
    data: {
      provider: req.body.provider,
      model: req.body.model,
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
    const rules = await readWorkspaceRules(client);
    const tasks = req.body.plan.tasks;
    await validatePlanEvidence(client, project.id, tasks);
    if (
      rules.require_due_date_for_high_priority === true &&
      tasks.some((task) => task.priority === "high" && !task.dueDate)
    ) {
      throw new AppError(
        422,
        "HIGH_PRIORITY_DUE_DATE_REQUIRED",
        "This workspace requires due dates for high-priority work. Change those proposals before applying the plan."
      );
    }
    const open = await client.query(
      "SELECT COUNT(*)::int AS count FROM tasks WHERE user_id = $1 AND status <> 'completed'",
      [req.user.id]
    );
    const limit = Number(rules.max_open_tasks_per_user || 100);
    if (Number(open.rows[0].count) + tasks.length > limit) {
      throw new AppError(
        409,
        "OPEN_TASK_LIMIT_REACHED",
        `This plan would exceed the workspace limit of ${limit} open tasks per user.`
      );
    }

    const pending = [...tasks];
    const createdByTempId = new Map();
    const created = [];
    while (pending.length > 0) {
      const index = pending.findIndex(
        (task) => !task.parentTempId || createdByTempId.has(task.parentTempId)
      );
      if (index === -1) {
        throw new AppError(
          422,
          "AI_PLAN_HIERARCHY_INVALID",
          "The approved plan contains an invalid hierarchy."
        );
      }
      const [task] = pending.splice(index, 1);
      const parentId = task.parentTempId ? createdByTempId.get(task.parentTempId) : null;
      const inserted = await client.query(
        `INSERT INTO tasks
           (user_id, project_id, title, description, status, priority, due_date, task_type, parent_task_id)
         VALUES ($1, $2, $3, $4, 'todo', $5, $6, $7, $8)
         RETURNING id, title, task_type, priority, parent_task_id`,
        [
          req.user.id,
          project.id,
          task.title,
          task.description,
          task.priority,
          task.dueDate,
          task.taskType,
          parentId
        ]
      );
      const row = inserted.rows[0];
      const issueKey = `${project.key}-${row.id}`;
      await client.query("UPDATE tasks SET issue_key = $1 WHERE id = $2", [issueKey, row.id]);
      for (const [position, body] of task.acceptanceCriteria.entries()) {
        await client.query(
          `INSERT INTO task_acceptance_criteria (task_id, body, position, created_by)
           VALUES ($1, $2, $3, $4)`,
          [row.id, body, position, req.user.id]
        );
      }
      await logActivity(client, {
        userId: req.user.id,
        action: "task_created",
        entityType: "task",
        entityId: row.id,
        entityTitle: row.title,
        details: {
          issueKey,
          taskType: row.task_type,
          parentId,
          source: "ai_plan",
          evidenceIds: task.evidenceIds
        }
      });
      createdByTempId.set(task.tempId, Number(row.id));
      created.push({ id: Number(row.id), issueKey, tempId: task.tempId, title: row.title });
    }
    await logActivity(client, {
      userId: req.user.id,
      action: "ai_plan_applied",
      entityType: "project",
      entityId: project.id,
      entityTitle: project.name,
      details: { createdCount: created.length }
    });
    await client.query("COMMIT");
    return res.status(201).json({ data: { created } });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

module.exports = { applyAiPlan, previewAiPlan };
