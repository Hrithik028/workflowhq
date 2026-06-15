const pool = require("../config/db");

const VALID_STATUSES = ["todo", "in_progress", "completed"];
const VALID_PRIORITIES = ["low", "medium", "high"];

const validateStatus = (status) => VALID_STATUSES.includes(status);
const validatePriority = (priority) => VALID_PRIORITIES.includes(priority);

const getTasks = async (req, res, next) => {
  const { status, priority } = req.query;
  const values = [req.user.id];
  const conditions = ["user_id = $1"];

  if (status) {
    if (!validateStatus(status)) {
      return res.status(400).json({ message: "Invalid status filter." });
    }

    values.push(status);
    conditions.push(`status = $${values.length}`);
  }

  if (priority) {
    if (!validatePriority(priority)) {
      return res.status(400).json({ message: "Invalid priority filter." });
    }

    values.push(priority);
    conditions.push(`priority = $${values.length}`);
  }

  try {
    const result = await pool.query(
      `SELECT id, user_id, title, description, status, priority, due_date, created_at, updated_at
       FROM tasks
       WHERE ${conditions.join(" AND ")}
       ORDER BY
         CASE priority
           WHEN 'high' THEN 1
           WHEN 'medium' THEN 2
           ELSE 3
         END,
         COALESCE(due_date, CURRENT_DATE + INTERVAL '3650 days'),
         updated_at DESC`,
      values
    );

    return res.status(200).json(result.rows);
  } catch (error) {
    return next(error);
  }
};

const createTask = async (req, res, next) => {
  const { title, description = "", status = "todo", priority = "medium", due_date = null } = req.body;

  if (!title) {
    return res.status(400).json({ message: "Task title is required." });
  }

  if (!validateStatus(status)) {
    return res.status(400).json({ message: "Invalid task status." });
  }

  if (!validatePriority(priority)) {
    return res.status(400).json({ message: "Invalid task priority." });
  }

  try {
    const result = await pool.query(
      `INSERT INTO tasks (user_id, title, description, status, priority, due_date)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, user_id, title, description, status, priority, due_date, created_at, updated_at`,
      [req.user.id, title.trim(), description.trim(), status, priority, due_date || null]
    );

    return res.status(201).json({
      message: "Task created successfully.",
      task: result.rows[0]
    });
  } catch (error) {
    return next(error);
  }
};

const getTaskById = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, user_id, title, description, status, priority, due_date, created_at, updated_at
       FROM tasks
       WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Task not found." });
    }

    return res.status(200).json(result.rows[0]);
  } catch (error) {
    return next(error);
  }
};

const updateTask = async (req, res, next) => {
  const { title, description = "", status, priority, due_date = null } = req.body;

  if (!title) {
    return res.status(400).json({ message: "Task title is required." });
  }

  if (!validateStatus(status)) {
    return res.status(400).json({ message: "Invalid task status." });
  }

  if (!validatePriority(priority)) {
    return res.status(400).json({ message: "Invalid task priority." });
  }

  try {
    const result = await pool.query(
      `UPDATE tasks
       SET title = $1,
           description = $2,
           status = $3,
           priority = $4,
           due_date = $5,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6 AND user_id = $7
       RETURNING id, user_id, title, description, status, priority, due_date, created_at, updated_at`,
      [title.trim(), description.trim(), status, priority, due_date || null, req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Task not found." });
    }

    return res.status(200).json({
      message: "Task updated successfully.",
      task: result.rows[0]
    });
  } catch (error) {
    return next(error);
  }
};

const deleteTask = async (req, res, next) => {
  try {
    const result = await pool.query("DELETE FROM tasks WHERE id = $1 AND user_id = $2 RETURNING id", [
      req.params.id,
      req.user.id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Task not found." });
    }

    return res.status(200).json({ message: "Task deleted successfully." });
  } catch (error) {
    return next(error);
  }
};

const getTaskStats = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT
         COUNT(*)::int AS total_tasks,
         COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_tasks,
         COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress_tasks,
         COUNT(*) FILTER (WHERE status = 'todo')::int AS todo_tasks,
         COUNT(*) FILTER (WHERE priority = 'high')::int AS high_priority_tasks
       FROM tasks
       WHERE user_id = $1`,
      [req.user.id]
    );

    return res.status(200).json(result.rows[0]);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getTasks,
  createTask,
  getTaskById,
  updateTask,
  deleteTask,
  getTaskStats
};

