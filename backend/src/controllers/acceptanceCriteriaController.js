const { logActivity } = require("../lib/activity");
const { AppError } = require("../lib/errors");
const { canAccessTask, getProjectRole } = require("../lib/projectAccess");

const criterionFields = `id, task_id, body, completed, position, created_by, created_at, updated_at`;

const loadTask = async (db, taskId, userId) => {
  const result = await db.query("SELECT id, user_id, project_id, title FROM tasks WHERE id = $1", [
    taskId
  ]);
  const task = result.rows[0];
  if (!task || !(await canAccessTask(db, task, userId))) {
    throw new AppError(404, "TASK_NOT_FOUND", "Task not found.");
  }
  return task;
};

const requireTaskEditor = async (db, task, userId) => {
  if (!task.project_id) {
    if (Number(task.user_id) !== Number(userId)) {
      throw new AppError(404, "TASK_NOT_FOUND", "Task not found.");
    }
    return;
  }

  const role = await getProjectRole(db, task.project_id, userId);
  if (role !== "owner" && role !== "editor") {
    throw new AppError(
      403,
      "TASK_EDITOR_REQUIRED",
      "Project editor access is required to change acceptance criteria."
    );
  }
};

const loadEditableTask = async (db, taskId, userId) => {
  const task = await loadTask(db, taskId, userId);
  await requireTaskEditor(db, task, userId);
  return task;
};

const loadCriterion = async (db, taskId, criterionId) => {
  const result = await db.query(
    `SELECT ${criterionFields}
     FROM task_acceptance_criteria
     WHERE id = $1 AND task_id = $2`,
    [criterionId, taskId]
  );
  if (!result.rows[0]) {
    throw new AppError(404, "ACCEPTANCE_CRITERION_NOT_FOUND", "Acceptance criterion not found.");
  }
  return result.rows[0];
};

const recordChange = (db, req, task, change) =>
  logActivity(db, {
    userId: req.user.id,
    action: "task_updated",
    entityType: "task",
    entityId: task.id,
    entityTitle: task.title,
    details: { change }
  });

const listAcceptanceCriteria = async (req, res) => {
  const db = req.app.locals.db;
  await loadTask(db, req.params.id, req.user.id);
  const result = await db.query(
    `SELECT ${criterionFields}
     FROM task_acceptance_criteria
     WHERE task_id = $1
     ORDER BY position ASC, id ASC`,
    [req.params.id]
  );
  return res.status(200).json({ data: result.rows });
};

const createAcceptanceCriterion = async (req, res) => {
  const db = req.app.locals.db;
  const task = await loadEditableTask(db, req.params.id, req.user.id);
  const positionResult = await db.query(
    "SELECT COALESCE(MAX(position), -1)::int AS last_position FROM task_acceptance_criteria WHERE task_id = $1",
    [task.id]
  );
  const position = Number(positionResult.rows[0].last_position) + 1;
  const result = await db.query(
    `INSERT INTO task_acceptance_criteria (task_id, body, position, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING ${criterionFields}`,
    [task.id, req.body.body, position, req.user.id]
  );
  await recordChange(db, req, task, "acceptance_criterion_added");
  return res.status(201).json({ data: result.rows[0] });
};

const updateAcceptanceCriterion = async (req, res) => {
  const db = req.app.locals.db;
  const task = await loadEditableTask(db, req.params.id, req.user.id);
  await loadCriterion(db, task.id, req.params.criterionId);
  const result = await db.query(
    `UPDATE task_acceptance_criteria
     SET body = $1, completed = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $3 AND task_id = $4
     RETURNING ${criterionFields}`,
    [req.body.body, req.body.completed, req.params.criterionId, task.id]
  );
  await recordChange(db, req, task, "acceptance_criterion_updated");
  return res.status(200).json({ data: result.rows[0] });
};

const reorderAcceptanceCriteria = async (req, res) => {
  const db = req.app.locals.db;
  const task = await loadEditableTask(db, req.params.id, req.user.id);
  const current = await db.query(
    "SELECT id FROM task_acceptance_criteria WHERE task_id = $1 ORDER BY position ASC, id ASC",
    [task.id]
  );
  const currentIds = current.rows.map((row) => Number(row.id));
  const requestedIds = req.body.criterionIds;
  if (
    currentIds.length !== requestedIds.length ||
    currentIds.some((criterionId) => !requestedIds.includes(criterionId))
  ) {
    throw new AppError(
      409,
      "ACCEPTANCE_CRITERIA_ORDER_MISMATCH",
      "The submitted order must include every acceptance criterion exactly once."
    );
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    for (const [position, criterionId] of requestedIds.entries()) {
      await client.query(
        "UPDATE task_acceptance_criteria SET position = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND task_id = $3",
        [position, criterionId, task.id]
      );
    }
    const result = await client.query(
      `SELECT ${criterionFields}
       FROM task_acceptance_criteria
       WHERE task_id = $1
       ORDER BY position ASC, id ASC`,
      [task.id]
    );
    await recordChange(client, req, task, "acceptance_criteria_reordered");
    await client.query("COMMIT");
    return res.status(200).json({ data: result.rows });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const deleteAcceptanceCriterion = async (req, res) => {
  const db = req.app.locals.db;
  const task = await loadEditableTask(db, req.params.id, req.user.id);
  await loadCriterion(db, task.id, req.params.criterionId);
  await db.query("DELETE FROM task_acceptance_criteria WHERE id = $1 AND task_id = $2", [
    req.params.criterionId,
    task.id
  ]);
  await recordChange(db, req, task, "acceptance_criterion_deleted");
  return res.status(204).send();
};

module.exports = {
  createAcceptanceCriterion,
  deleteAcceptanceCriterion,
  listAcceptanceCriteria,
  reorderAcceptanceCriteria,
  updateAcceptanceCriterion
};
