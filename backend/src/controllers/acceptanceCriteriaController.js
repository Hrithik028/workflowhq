const { AppError } = require("../lib/errors");
const { canAccessTask } = require("../lib/projectAccess");
const {
  addAcceptanceCriterion,
  removeAcceptanceCriterion,
  reorderAcceptanceCriteria: reorderCriteriaMutation,
  updateAcceptanceCriterion: updateCriterionMutation
} = require("../lib/taskMutationService");

const criterionFields = `id, task_id, body, completed, position, created_by, created_at, updated_at`;

const loadTask = async (db, taskId, userId) => {
  const result = await db.query(
    "SELECT id, user_id, project_id, workspace_id, title FROM tasks WHERE id = $1",
    [taskId]
  );
  const task = result.rows[0];
  if (!task || !(await canAccessTask(db, task, userId))) {
    throw new AppError(404, "TASK_NOT_FOUND", "Task not found.");
  }
  return task;
};

const withTransaction = async (db, callback) => {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

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
  const result = await withTransaction(req.app.locals.db, (client) =>
    addAcceptanceCriterion(client, {
      userId: req.user.id,
      taskId: req.params.id,
      body: req.body.body
    })
  );
  return res.status(201).json({ data: result.criterion });
};

const updateAcceptanceCriterion = async (req, res) => {
  const result = await withTransaction(req.app.locals.db, (client) =>
    updateCriterionMutation(client, {
      userId: req.user.id,
      taskId: req.params.id,
      criterionId: req.params.criterionId,
      fields: req.body
    })
  );
  return res.status(200).json({ data: result.criterion });
};

const reorderAcceptanceCriteria = async (req, res) => {
  const result = await withTransaction(req.app.locals.db, (client) =>
    reorderCriteriaMutation(client, {
      userId: req.user.id,
      taskId: req.params.id,
      criterionIds: req.body.criterionIds
    })
  );
  return res.status(200).json({ data: result.criteria });
};

const deleteAcceptanceCriterion = async (req, res) => {
  await withTransaction(req.app.locals.db, (client) =>
    removeAcceptanceCriterion(client, {
      userId: req.user.id,
      taskId: req.params.id,
      criterionId: req.params.criterionId
    })
  );
  return res.status(204).send();
};

module.exports = {
  createAcceptanceCriterion,
  deleteAcceptanceCriterion,
  listAcceptanceCriteria,
  reorderAcceptanceCriteria,
  updateAcceptanceCriterion
};
