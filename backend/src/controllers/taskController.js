const { logActivity } = require("../lib/activity");
const { AppError } = require("../lib/errors");

const taskFields = `
  t.id,
  t.user_id,
  t.project_id,
  p.name AS project_name,
  p.key AS project_key,
  t.issue_key,
  t.task_type,
  t.parent_task_id,
  parent.title AS parent_title,
  t.title,
  t.description,
  t.status,
  t.priority,
  t.start_date,
  t.due_date,
  t.created_at,
  t.updated_at,
  COALESCE(child_stats.child_count, 0)::int AS child_count,
  COALESCE(child_stats.completed_child_count, 0)::int AS completed_child_count`;

const taskJoins = `
  LEFT JOIN projects p ON p.id = t.project_id AND p.user_id = t.user_id
  LEFT JOIN tasks parent ON parent.id = t.parent_task_id AND parent.user_id = t.user_id
  LEFT JOIN (
    SELECT user_id, parent_task_id,
           COUNT(*)::int AS child_count,
           SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)::int AS completed_child_count
    FROM tasks
    WHERE parent_task_id IS NOT NULL
    GROUP BY user_id, parent_task_id
  ) child_stats ON child_stats.parent_task_id = t.id AND child_stats.user_id = t.user_id`;

const typeRank = {
  initiative: 5,
  epic: 4,
  story: 3,
  task: 2,
  bug: 2,
  subtask: 1
};

const verifyProjectOwnership = async (db, projectId, userId) => {
  if (!projectId) {
    return { key: "INB" };
  }
  const result = await db.query("SELECT id, key FROM projects WHERE id = $1 AND user_id = $2", [
    projectId,
    userId
  ]);
  if (result.rows.length === 0) {
    throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");
  }
  return result.rows[0];
};

const verifyParentHierarchy = async ({ db, parentId, projectId, taskType, userId, taskId }) => {
  if (!parentId) return;
  let cursorId = parentId;
  let depth = 0;
  let parent;

  while (cursorId) {
    const result = await db.query(
      `SELECT id, project_id, parent_task_id, task_type
       FROM tasks WHERE id = $1 AND user_id = $2`,
      [cursorId, userId]
    );
    if (result.rows.length === 0) {
      throw new AppError(404, "PARENT_TASK_NOT_FOUND", "Parent task not found.");
    }
    const current = result.rows[0];
    if (!parent) parent = current;
    if (taskId && Number(current.id) === Number(taskId)) {
      throw new AppError(409, "TASK_HIERARCHY_CYCLE", "A task cannot become its own ancestor.");
    }
    depth += 1;
    if (depth >= 5) {
      throw new AppError(409, "TASK_HIERARCHY_DEPTH", "Task hierarchy is limited to five levels.");
    }
    cursorId = current.parent_task_id;
  }

  if (Number(parent.project_id || 0) !== Number(projectId || 0)) {
    throw new AppError(
      409,
      "TASK_PROJECT_MISMATCH",
      "Parent and child tasks must belong to the same project."
    );
  }
  if (typeRank[parent.task_type] <= typeRank[taskType]) {
    throw new AppError(
      409,
      "INVALID_TASK_HIERARCHY",
      `${parent.task_type} tickets can only contain lower-level work.`
    );
  }
};

const selectTaskById = async (db, id, userId) => {
  const result = await db.query(
    `SELECT ${taskFields}
     FROM tasks t
     ${taskJoins}
     WHERE t.id = $1 AND t.user_id = $2`,
    [id, userId]
  );
  return result.rows[0];
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
    conditions.push(
      `(t.title ILIKE $${values.length} OR t.description ILIKE $${values.length} OR t.issue_key ILIKE $${values.length})`
    );
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
     ${taskJoins}
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
  const { title, description, status, priority, startDate, dueDate, projectId, taskType, parentId } =
    req.body;

  try {
    await client.query("BEGIN");
    const project = await verifyProjectOwnership(client, projectId, req.user.id);
    await verifyParentHierarchy({
      db: client,
      parentId,
      projectId,
      taskType,
      userId: req.user.id
    });
    const result = await client.query(
      `INSERT INTO tasks
         (user_id, project_id, title, description, status, priority, start_date, due_date, task_type, parent_task_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        req.user.id,
        projectId,
        title,
        description,
        status,
        priority,
        startDate,
        dueDate,
        taskType,
        parentId
      ]
    );
    const taskId = result.rows[0].id;
    await client.query("UPDATE tasks SET issue_key = $1 WHERE id = $2", [
      `${project.key}-${taskId}`,
      taskId
    ]);
    const task = await selectTaskById(client, taskId, req.user.id);
    await logActivity(client, {
      userId: req.user.id,
      action: "task_created",
      entityType: "task",
      entityId: task.id,
      entityTitle: task.title,
      details: { issueKey: task.issue_key, taskType: task.task_type, parentId }
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

const createChildTask = async (req, res) => {
  req.body.parentId = Number(req.params.id);
  return createTask(req, res);
};

const getTaskById = async (req, res, next) => {
  const task = await selectTaskById(req.app.locals.db, req.params.id, req.user.id);
  if (!task) {
    return next(new AppError(404, "TASK_NOT_FOUND", "Task not found."));
  }
  return res.status(200).json({ data: task });
};

const getTaskChildren = async (req, res, next) => {
  const parentTask = await selectTaskById(req.app.locals.db, req.params.id, req.user.id);
  if (!parentTask) return next(new AppError(404, "TASK_NOT_FOUND", "Task not found."));
  const result = await req.app.locals.db.query(
    `SELECT ${taskFields}
     FROM tasks t
     ${taskJoins}
     WHERE t.parent_task_id = $1 AND t.user_id = $2
     ORDER BY t.created_at ASC, t.id ASC`,
    [req.params.id, req.user.id]
  );
  return res.status(200).json({ data: result.rows });
};

const updateTask = async (req, res, next) => {
  const db = req.app.locals.db;
  const client = await db.connect();
  const { title, description, status, priority, startDate, dueDate, projectId, taskType, parentId } =
    req.body;

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
    await verifyParentHierarchy({
      db: client,
      parentId,
      projectId,
      taskType,
      userId: req.user.id,
      taskId: req.params.id
    });
    const existing = existingResult.rows[0];
    if (Number(existing.project_id || 0) !== Number(projectId || 0)) {
      const childResult = await client.query(
        "SELECT COUNT(*)::int AS count FROM tasks WHERE parent_task_id = $1 AND user_id = $2",
        [req.params.id, req.user.id]
      );
      if (childResult.rows[0].count > 0) {
        throw new AppError(
          409,
          "TASK_HAS_CHILDREN",
          "Move or remove child tasks before changing this task's project."
        );
      }
    }
    await client.query(
      `UPDATE tasks
       SET project_id = $1, title = $2, description = $3, status = $4, priority = $5,
           start_date = $6, due_date = $7, task_type = $8, parent_task_id = $9,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $10 AND user_id = $11`,
      [
        projectId,
        title,
        description,
        status,
        priority,
        startDate,
        dueDate,
        taskType,
        parentId,
        req.params.id,
        req.user.id
      ]
    );
    const task = await selectTaskById(client, req.params.id, req.user.id);
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
    if (Number(existing.parent_task_id || 0) !== Number(parentId || 0)) {
      activities.push({
        action: "task_parent_changed",
        details: { from: existing.parent_task_id, to: parentId }
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
    const children = await client.query(
      "SELECT COUNT(*)::int AS count FROM tasks WHERE parent_task_id = $1 AND user_id = $2",
      [req.params.id, req.user.id]
    );
    if (children.rows[0].count > 0) {
      await client.query("ROLLBACK");
      return next(
        new AppError(409, "TASK_HAS_CHILDREN", "Move or delete this task's children first.")
      );
    }
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

module.exports = {
  createChildTask,
  createTask,
  deleteTask,
  getTaskById,
  getTaskChildren,
  getTasks,
  getTaskStats,
  updateTask
};
