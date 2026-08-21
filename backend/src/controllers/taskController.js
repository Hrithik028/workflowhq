const { logActivity } = require("../lib/activity");
const { AppError } = require("../lib/errors");

const taskFields = `
  t.id,
  t.user_id,
  t.project_id,
  p.name AS project_name,
  t.title,
  t.description,
  t.status,
  t.priority,
  t.due_date,
  t.created_at,
  t.updated_at`;

const verifyProjectOwnership = async (db, projectId, userId) => {
  if (!projectId) {
    return;
  }
  const result = await db.query("SELECT id FROM projects WHERE id = $1 AND user_id = $2", [
    projectId,
    userId
  ]);
  if (result.rows.length === 0) {
    throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");
  }
};

const getTasks = async (req, res) => {
  const { page, limit, status, priority, projectId, search, sort, order } = req.query;
  const values = [req.user.id];
  const conditions = ["t.user_id = $1"];

  const addCondition = (sql, value) => {
    values.push(value);
    conditions.push(sql.replace("?", `$${values.length}`));
  };
  if (status) addCondition("t.status = ?", status);
  if (priority) addCondition("t.priority = ?", priority);
  if (projectId) addCondition("t.project_id = ?", projectId);
  if (search) {
    values.push(`%${search}%`);
    conditions.push(`(t.title ILIKE $${values.length} OR t.description ILIKE $${values.length})`);
  }

  const where = conditions.join(" AND ");
  const countResult = await req.app.locals.db.query(
    `SELECT COUNT(*)::int AS total FROM tasks t WHERE ${where}`,
    values
  );
  const total = countResult.rows[0].total;
  const sortColumns = {
    updated_at: "t.updated_at",
    created_at: "t.created_at",
    due_date: "t.due_date",
    title: "LOWER(t.title)",
    priority: "CASE t.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END"
  };
  const offset = (page - 1) * limit;
  const listValues = [...values, limit, offset];
  const rows = await req.app.locals.db.query(
    `SELECT ${taskFields}
     FROM tasks t
     LEFT JOIN projects p ON p.id = t.project_id AND p.user_id = t.user_id
     WHERE ${where}
     ORDER BY ${sortColumns[sort]} ${order.toUpperCase()} NULLS LAST, t.id DESC
     LIMIT $${listValues.length - 1} OFFSET $${listValues.length}`,
    listValues
  );

  return res.status(200).json({
    data: rows.rows,
    pagination: {
      page,
      limit,
      total,
      pages: total === 0 ? 0 : Math.ceil(total / limit)
    }
  });
};

const createTask = async (req, res) => {
  const db = req.app.locals.db;
  const client = await db.connect();
  const { title, description, status, priority, dueDate, projectId } = req.body;

  try {
    await client.query("BEGIN");
    await verifyProjectOwnership(client, projectId, req.user.id);
    const result = await client.query(
      `INSERT INTO tasks (user_id, project_id, title, description, status, priority, due_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, user_id, project_id, title, description, status, priority, due_date, created_at, updated_at`,
      [req.user.id, projectId, title, description, status, priority, dueDate]
    );
    const task = result.rows[0];
    await logActivity(client, {
      userId: req.user.id,
      action: "task_created",
      entityType: "task",
      entityId: task.id,
      entityTitle: task.title
    });
    await client.query("COMMIT");
    return res.status(201).json({ data: task });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const getTaskById = async (req, res, next) => {
  const result = await req.app.locals.db.query(
    `SELECT ${taskFields}
     FROM tasks t
     LEFT JOIN projects p ON p.id = t.project_id AND p.user_id = t.user_id
     WHERE t.id = $1 AND t.user_id = $2`,
    [req.params.id, req.user.id]
  );
  if (result.rows.length === 0) {
    return next(new AppError(404, "TASK_NOT_FOUND", "Task not found."));
  }
  return res.status(200).json({ data: result.rows[0] });
};

const updateTask = async (req, res, next) => {
  const db = req.app.locals.db;
  const client = await db.connect();
  const { title, description, status, priority, dueDate, projectId } = req.body;

  try {
    await client.query("BEGIN");
    const existingResult = await client.query(
      "SELECT * FROM tasks WHERE id = $1 AND user_id = $2",
      [req.params.id, req.user.id]
    );
    if (existingResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return next(new AppError(404, "TASK_NOT_FOUND", "Task not found."));
    }
    await verifyProjectOwnership(client, projectId, req.user.id);
    const existing = existingResult.rows[0];
    const result = await client.query(
      `UPDATE tasks
       SET project_id = $1, title = $2, description = $3, status = $4, priority = $5,
           due_date = $6, updated_at = CURRENT_TIMESTAMP
       WHERE id = $7 AND user_id = $8
       RETURNING id, user_id, project_id, title, description, status, priority, due_date, created_at, updated_at`,
      [projectId, title, description, status, priority, dueDate, req.params.id, req.user.id]
    );
    const task = result.rows[0];
    const activities = [];
    if (existing.status !== status) {
      activities.push({
        action: status === "completed" ? "task_completed" : "task_status_changed",
        details: { from: existing.status, to: status }
      });
    }
    if (existing.priority !== priority) {
      activities.push({
        action: "task_priority_changed",
        details: { from: existing.priority, to: priority }
      });
    }
    if (activities.length === 0) activities.push({ action: "task_updated", details: {} });
    for (const activity of activities) {
      await logActivity(client, {
        userId: req.user.id,
        action: activity.action,
        entityType: "task",
        entityId: task.id,
        entityTitle: task.title,
        details: activity.details
      });
    }
    await client.query("COMMIT");
    return res.status(200).json({ data: task });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const deleteTask = async (req, res, next) => {
  const db = req.app.locals.db;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      "DELETE FROM tasks WHERE id = $1 AND user_id = $2 RETURNING id, title",
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return next(new AppError(404, "TASK_NOT_FOUND", "Task not found."));
    }
    await logActivity(client, {
      userId: req.user.id,
      action: "task_deleted",
      entityType: "task",
      entityTitle: result.rows[0].title
    });
    await client.query("COMMIT");
    return res.status(204).send();
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const getTaskStats = async (req, res) => {
  const values = [req.user.id];
  let projectCondition = "";
  if (req.query.projectId) {
    values.push(req.query.projectId);
    projectCondition = ` AND project_id = $${values.length}`;
  }
  const result = await req.app.locals.db.query(
    `SELECT
       COUNT(*)::int AS total_tasks,
       COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0)::int AS completed_tasks,
       COALESCE(SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END), 0)::int AS in_progress_tasks,
       COALESCE(SUM(CASE WHEN status = 'todo' THEN 1 ELSE 0 END), 0)::int AS todo_tasks,
       COALESCE(SUM(CASE WHEN priority = 'high' THEN 1 ELSE 0 END), 0)::int AS high_priority_tasks,
       COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE AND status <> 'completed' THEN 1 ELSE 0 END), 0)::int AS overdue_tasks
     FROM tasks
     WHERE user_id = $1${projectCondition}`,
    values
  );
  return res.status(200).json({ data: result.rows[0] });
};

module.exports = { createTask, deleteTask, getTaskById, getTasks, getTaskStats, updateTask };
