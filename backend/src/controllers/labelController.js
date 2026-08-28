const { logActivity } = require("../lib/activity");
const { AppError } = require("../lib/errors");
const { canAccessTask, getProjectRole } = require("../lib/projectAccess");

const requireProjectEditor = async (db, projectId, userId) => {
  const role = await getProjectRole(db, projectId, userId);
  if (!role) throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");
  if (role !== "owner" && role !== "editor") {
    throw new AppError(
      403,
      "PROJECT_EDITOR_REQUIRED",
      "Only a project editor or owner can manage labels."
    );
  }
};

const listLabels = async (req, res, next) => {
  const db = req.app.locals.db;
  const role = await getProjectRole(db, req.params.id, req.user.id);
  if (!role) {
    return next(new AppError(404, "PROJECT_NOT_FOUND", "Project not found."));
  }
  const result = await db.query(
    "SELECT id, project_id, name, color, created_at FROM labels WHERE project_id = $1 ORDER BY name ASC",
    [req.params.id]
  );
  return res.status(200).json({ data: result.rows });
};

const createLabel = async (req, res, next) => {
  const db = req.app.locals.db;
  try {
    await requireProjectEditor(db, req.params.id, req.user.id);
  } catch (error) {
    return next(error);
  }
  const duplicate = await db.query("SELECT id FROM labels WHERE project_id = $1 AND name = $2", [
    req.params.id,
    req.body.name
  ]);
  if (duplicate.rows.length > 0) {
    return next(
      new AppError(409, "LABEL_EXISTS", "A label with this name already exists on the project.")
    );
  }
  const result = await db.query(
    `INSERT INTO labels (project_id, name, color)
     VALUES ($1, $2, $3)
     RETURNING id, project_id, name, color, created_at`,
    [req.params.id, req.body.name, req.body.color]
  );
  return res.status(201).json({ data: result.rows[0] });
};

const updateLabel = async (req, res, next) => {
  const db = req.app.locals.db;
  try {
    await requireProjectEditor(db, req.params.id, req.user.id);
  } catch (error) {
    return next(error);
  }
  const existing = await db.query("SELECT id FROM labels WHERE id = $1 AND project_id = $2", [
    req.params.labelId,
    req.params.id
  ]);
  if (existing.rows.length === 0) {
    return next(new AppError(404, "LABEL_NOT_FOUND", "Label not found."));
  }
  const duplicate = await db.query(
    "SELECT id FROM labels WHERE project_id = $1 AND name = $2 AND id <> $3",
    [req.params.id, req.body.name, req.params.labelId]
  );
  if (duplicate.rows.length > 0) {
    return next(
      new AppError(409, "LABEL_EXISTS", "A label with this name already exists on the project.")
    );
  }
  const result = await db.query(
    `UPDATE labels SET name = $1, color = $2 WHERE id = $3
     RETURNING id, project_id, name, color, created_at`,
    [req.body.name, req.body.color, req.params.labelId]
  );
  return res.status(200).json({ data: result.rows[0] });
};

const deleteLabel = async (req, res, next) => {
  const db = req.app.locals.db;
  try {
    await requireProjectEditor(db, req.params.id, req.user.id);
  } catch (error) {
    return next(error);
  }
  const result = await db.query("DELETE FROM labels WHERE id = $1 AND project_id = $2 RETURNING id", [
    req.params.labelId,
    req.params.id
  ]);
  if (result.rows.length === 0) {
    return next(new AppError(404, "LABEL_NOT_FOUND", "Label not found."));
  }
  return res.status(204).send();
};

// Attach/detach live under /api/tasks/:id/labels rather than the project route -
// access is governed by the task's own visibility/edit rules (which already
// account for inbox tasks and cross-project moves), not by re-deriving them here.
const attachLabel = async (req, res, next) => {
  const db = req.app.locals.db;
  const taskResult = await db.query("SELECT * FROM tasks WHERE id = $1", [req.params.id]);
  const task = taskResult.rows[0];
  if (!task || !(await canAccessTask(db, task, req.user.id))) {
    return next(new AppError(404, "TASK_NOT_FOUND", "Task not found."));
  }
  if (!task.project_id) {
    return next(
      new AppError(422, "TASK_NOT_IN_PROJECT", "Inbox tickets can't carry project labels.")
    );
  }
  try {
    await requireProjectEditor(db, task.project_id, req.user.id);
  } catch (error) {
    return next(error);
  }
  const label = await db.query("SELECT id, name FROM labels WHERE id = $1 AND project_id = $2", [
    req.body.labelId,
    task.project_id
  ]);
  if (label.rows.length === 0) {
    return next(new AppError(404, "LABEL_NOT_FOUND", "Label not found."));
  }
  await db.query(
    "INSERT INTO task_labels (task_id, label_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [task.id, req.body.labelId]
  );
  await logActivity(db, {
    userId: req.user.id,
    action: "task_label_added",
    entityType: "task",
    entityId: task.id,
    entityTitle: task.title,
    details: { labelId: label.rows[0].id, labelName: label.rows[0].name }
  });
  return res.status(204).send();
};

const detachLabel = async (req, res, next) => {
  const db = req.app.locals.db;
  const taskResult = await db.query("SELECT * FROM tasks WHERE id = $1", [req.params.id]);
  const task = taskResult.rows[0];
  if (!task || !(await canAccessTask(db, task, req.user.id))) {
    return next(new AppError(404, "TASK_NOT_FOUND", "Task not found."));
  }
  try {
    await requireProjectEditor(db, task.project_id, req.user.id);
  } catch (error) {
    return next(error);
  }
  await db.query("DELETE FROM task_labels WHERE task_id = $1 AND label_id = $2", [
    task.id,
    req.params.labelId
  ]);
  return res.status(204).send();
};

module.exports = { attachLabel, createLabel, deleteLabel, detachLabel, listLabels, updateLabel };
