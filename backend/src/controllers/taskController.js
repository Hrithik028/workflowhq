const { logActivity } = require("../lib/activity");
const { AppError } = require("../lib/errors");
const { canAccessTask } = require("../lib/projectAccess");
const { currentWorkspace } = require("../lib/workspaceContext");
const {
  createTask: createTaskMutation,
  setTaskArchived,
  updateTask: updateTaskMutation,
  verifyProjectAccess
} = require("../lib/taskMutationService");

const taskFields = `
  t.id,
  t.user_id,
  t.project_id,
  p.name AS project_name,
  p.key AS project_key,
  p.archived_at AS project_archived_at,
  t.issue_key,
  t.task_type,
  t.parent_task_id,
  parent.title AS parent_title,
  t.title,
  t.description,
  t.status,
  t.workflow_stage,
  status_labels.label AS status_label,
  t.priority,
  t.start_date,
  t.due_date,
  t.assignee_id,
  assignee.name AS assignee_name,
  assignee.email AS assignee_email,
  t.sprint_id,
  sprint.name AS sprint_name,
  t.rank,
  t.archived_at,
  t.archived_by,
  t.version,
  t.created_at,
  t.updated_at,
  COALESCE(child_stats.child_count, 0)::int AS child_count,
  COALESCE(child_stats.completed_child_count, 0)::int AS completed_child_count`;

// Note: project_id / parent_task_id are already globally unique keys, so joining
// on them alone is sufficient scoping. The previous "AND ...user_id = t.user_id"
// clauses assumed a task's creator always matched its project's/parent's creator,
// which breaks as soon as a project has more than one member.
const taskJoins = `
  LEFT JOIN projects p ON p.id = t.project_id
  LEFT JOIN project_status_labels status_labels ON status_labels.project_id = t.project_id AND status_labels.status = t.workflow_stage
  LEFT JOIN tasks parent ON parent.id = t.parent_task_id
  LEFT JOIN users assignee ON assignee.id = t.assignee_id
  LEFT JOIN sprints sprint ON sprint.id = t.sprint_id
  LEFT JOIN (
    SELECT parent_task_id,
           COUNT(*)::int AS child_count,
           SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)::int AS completed_child_count
    FROM tasks
    WHERE parent_task_id IS NOT NULL AND archived_at IS NULL
    GROUP BY parent_task_id
  ) child_stats ON child_stats.parent_task_id = t.id`;

// A task is visible to a user when it's their own inbox (no project) ticket,
// or when they're a member (any role) of the project it belongs to.
const visibleTaskCondition = (userIndex, values) => {
  const visibility = `((t.project_id IS NULL AND t.user_id = $${userIndex}) OR t.project_id IN (SELECT project_id FROM project_members WHERE user_id = $${userIndex}))`;
  if (!currentWorkspace()) return visibility;
  values.push(currentWorkspace());
  return `${visibility} AND t.workspace_id = $${values.length}`;
};

// Labels are attached with one extra batch query per response rather than a
// JOIN + JSON aggregate in taskFields - pg-mem (used by the test suite) has no
// json_build_object/json_agg support, and a plain IN(...) lookup here is one
// query total for a page of tasks rather than one per row.
const attachLabels = async (db, tasks) => {
  if (tasks.length === 0) return tasks;
  const ids = tasks.map((task) => task.id);
  const placeholders = ids.map((_, index) => `$${index + 1}`).join(", ");
  const result = await db.query(
    `SELECT tl.task_id, l.id, l.project_id, l.name, l.color, l.created_at
     FROM task_labels tl
     JOIN labels l ON l.id = tl.label_id
     WHERE tl.task_id IN (${placeholders})
     ORDER BY l.name ASC`,
    ids
  );
  const byTask = new Map();
  for (const row of result.rows) {
    const taskId = Number(row.task_id);
    const list = byTask.get(taskId) || [];
    list.push({
      id: row.id,
      project_id: row.project_id,
      name: row.name,
      color: row.color,
      created_at: row.created_at
    });
    byTask.set(taskId, list);
  }
  return tasks.map((task) => ({ ...task, labels: byTask.get(Number(task.id)) || [] }));
};

const attachLabelsToOne = async (db, task) => {
  if (!task) return task;
  const [withLabels] = await attachLabels(db, [task]);
  return withLabels;
};

const selectTaskById = async (db, id, userId) => {
  const values = [id, userId];
  const visible = visibleTaskCondition(2, values);
  const result = await db.query(
    `SELECT ${taskFields}
     FROM tasks t
     ${taskJoins}
     WHERE t.id = $1 AND ${visible}`,
    values
  );
  return attachLabelsToOne(db, result.rows[0]);
};

const getTasks = async (req, res) => {
  const { page, limit, status, priority, projectId, search, sort, order, archived } = req.query;
  const values = [req.user.id];
  const conditions = [visibleTaskCondition(1, values)];

  if (archived) {
    conditions.push("t.archived_at IS NOT NULL");
    conditions.push("(t.project_id IS NULL OR p.archived_at IS NULL)");
  } else {
    conditions.push("t.archived_at IS NULL");
    conditions.push("(t.project_id IS NULL OR p.archived_at IS NULL)");
  }

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
    `SELECT COUNT(*)::int AS total
     FROM tasks t
     LEFT JOIN projects p ON p.id = t.project_id
     WHERE ${where}`,
    values
  );
  const total = countResult.rows[0].total;
  const sortColumns = {
    updated_at: "t.updated_at",
    created_at: "t.created_at",
    due_date: "t.due_date",
    title: "LOWER(t.title)",
    priority: "CASE t.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END",
    rank: "t.rank"
  };
  const offset = (page - 1) * limit;
  const listValues = [...values, limit, offset];
  let rows;
  if (archived) {
    // Select the page of IDs before loading the richer joined row. This keeps
    // archived pagination stable even on PostgreSQL-compatible test adapters
    // that can mis-plan LIMIT/OFFSET across the hierarchy aggregate join.
    const idRows = await req.app.locals.db.query(
      `SELECT t.id
       FROM tasks t
       LEFT JOIN projects p ON p.id = t.project_id
       WHERE ${where}
       ORDER BY ${sortColumns[sort]} ${order.toUpperCase()} NULLS LAST, t.id DESC
       LIMIT $${listValues.length - 1} OFFSET $${listValues.length}`,
      listValues
    );
    if (idRows.rows.length === 0) {
      rows = { rows: [] };
    } else {
      const ids = idRows.rows.map((row) => row.id);
      const placeholders = ids.map((_, index) => `$${index + 1}`).join(", ");
      rows = await req.app.locals.db.query(
        `SELECT ${taskFields}
         FROM tasks t
         ${taskJoins}
         WHERE t.id IN (${placeholders})
         ORDER BY ${sortColumns[sort]} ${order.toUpperCase()} NULLS LAST, t.id DESC`,
        ids
      );
    }
  } else {
    rows = await req.app.locals.db.query(
      `SELECT ${taskFields}
       FROM tasks t
       ${taskJoins}
       WHERE ${where}
       ORDER BY ${sortColumns[sort]} ${order.toUpperCase()} NULLS LAST, t.id DESC
       LIMIT $${listValues.length - 1} OFFSET $${listValues.length}`,
      listValues
    );
  }
  const data = await attachLabels(req.app.locals.db, rows.rows);

  return res.status(200).json({
    data,
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
  try {
    await client.query("BEGIN");
    const created = await createTaskMutation(client, {
      userId: req.user.id,
      fields: req.body
    });
    const task = await selectTaskById(client, created.id, req.user.id);
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
  const db = req.app.locals.db;
  const parentTask = await selectTaskById(db, req.params.id, req.user.id);
  if (!parentTask) return next(new AppError(404, "TASK_NOT_FOUND", "Task not found."));
  // Children always share their parent's project (enforced at creation by
  // verifyParentHierarchy), so anyone who can see the parent can see the children.
  const result = await db.query(
    `SELECT ${taskFields}
     FROM tasks t
     ${taskJoins}
     WHERE t.parent_task_id = $1 AND t.archived_at IS NULL
     ORDER BY t.created_at ASC, t.id ASC`,
    [req.params.id]
  );
  return res.status(200).json({ data: await attachLabels(db, result.rows) });
};

const updateTask = async (req, res) => {
  const db = req.app.locals.db;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await updateTaskMutation(client, {
      userId: req.user.id,
      taskId: req.params.id,
      fields: req.body
    });
    const task = await selectTaskById(client, req.params.id, req.user.id);
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
    const existingResult = await client.query("SELECT * FROM tasks WHERE id = $1", [req.params.id]);
    if (existingResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return next(new AppError(404, "TASK_NOT_FOUND", "Task not found."));
    }
    const existing = existingResult.rows[0];
    if (!(await canAccessTask(client, existing, req.user.id))) {
      await client.query("ROLLBACK");
      return next(new AppError(404, "TASK_NOT_FOUND", "Task not found."));
    }
    await verifyProjectAccess(client, existing.project_id, req.user.id, ["owner", "editor"]);
    const children = await client.query(
      "SELECT COUNT(*)::int AS count FROM tasks WHERE parent_task_id = $1",
      [req.params.id]
    );
    if (children.rows[0].count > 0) {
      await client.query("ROLLBACK");
      return next(
        new AppError(409, "TASK_HAS_CHILDREN", "Move or delete this task's children first.")
      );
    }
    const result = await client.query("DELETE FROM tasks WHERE id = $1 RETURNING id, title", [
      req.params.id
    ]);
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

const setTaskArchivedState = async (req, res, _next, archived) => {
  const db = req.app.locals.db;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await setTaskArchived(client, {
      userId: req.user.id,
      taskId: req.params.id,
      archived
    });
    const task = await selectTaskById(client, req.params.id, req.user.id);
    await client.query("COMMIT");
    return res.status(200).json({ data: task });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const archiveTask = (req, res, next) => setTaskArchivedState(req, res, next, true);
const restoreTask = (req, res, next) => setTaskArchivedState(req, res, next, false);

// Fractional ranking: moving a task only ever computes a value strictly
// between its two new neighbors, so a reorder is always a single UPDATE - the
// rest of the list never needs renumbering. The rebalance path only runs when
// two neighboring ranks are so close that float precision can't fit a value
// between them anymore, which resets the whole scoped list to evenly spaced
// integers before retrying the midpoint calc once.
const RANK_GAP = 1000;

const rankBetween = (previousRank, nextRank) => {
  if (previousRank == null && nextRank == null) return 0;
  if (previousRank == null) return nextRank - RANK_GAP;
  if (nextRank == null) return previousRank + RANK_GAP;
  return (previousRank + nextRank) / 2;
};

const updateTaskRank = async (req, res, next) => {
  const db = req.app.locals.db;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const existingResult = await client.query("SELECT * FROM tasks WHERE id = $1", [req.params.id]);
    if (existingResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return next(new AppError(404, "TASK_NOT_FOUND", "Task not found."));
    }
    const task = existingResult.rows[0];
    if (!(await canAccessTask(client, task, req.user.id))) {
      await client.query("ROLLBACK");
      return next(new AppError(404, "TASK_NOT_FOUND", "Task not found."));
    }
    if (task.archived_at) {
      await client.query("ROLLBACK");
      return next(new AppError(409, "TASK_ARCHIVED", "Restore this task before reordering it."));
    }
    await verifyProjectAccess(client, task.project_id, req.user.id, ["owner", "editor"]);

    const { previousTaskId, nextTaskId } = req.body;
    if (previousTaskId === task.id || nextTaskId === task.id) {
      await client.query("ROLLBACK");
      return next(
        new AppError(422, "TASK_RANK_NEIGHBOR_INVALID", "A task cannot be its own neighbor.")
      );
    }

    const loadNeighborRank = async (id) => {
      if (!id) return null;
      const result = await client.query(
        "SELECT project_id, user_id, workspace_id, archived_at, rank FROM tasks WHERE id = $1",
        [id]
      );
      const neighbor = result.rows[0];
      const sameProject =
        neighbor && Number(neighbor.project_id || 0) === Number(task.project_id || 0);
      const sameInboxOwner =
        task.project_id || !neighbor ? true : Number(neighbor.user_id) === Number(task.user_id);
      const sameWorkspace =
        neighbor && Number(neighbor.workspace_id || 0) === Number(task.workspace_id || 0);
      if (!neighbor || neighbor.archived_at || !sameProject || !sameInboxOwner || !sameWorkspace) {
        throw new AppError(
          422,
          "TASK_RANK_NEIGHBOR_INVALID",
          "The neighboring task must be in the same list."
        );
      }
      return neighbor.rank;
    };

    let previousRank;
    let nextRank;
    try {
      previousRank = await loadNeighborRank(previousTaskId);
      nextRank = await loadNeighborRank(nextTaskId);
    } catch (validationError) {
      await client.query("ROLLBACK");
      return next(validationError);
    }

    let newRank = rankBetween(previousRank, nextRank);
    const exhausted =
      (previousRank != null && newRank <= previousRank) ||
      (nextRank != null && newRank >= nextRank);
    if (exhausted) {
      const scopeCondition = task.project_id
        ? "project_id = $1"
        : "project_id IS NULL AND user_id = $1 AND workspace_id IS NOT DISTINCT FROM $2";
      const scopeValue = task.project_id || req.user.id;
      const allResult = await client.query(
        `SELECT id FROM tasks WHERE ${scopeCondition} AND archived_at IS NULL ORDER BY rank ASC NULLS LAST, id ASC`,
        task.project_id ? [scopeValue] : [scopeValue, task.workspace_id]
      );
      for (const [index, row] of allResult.rows.entries()) {
        await client.query(
          "UPDATE tasks SET rank = $1, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
          [index * RANK_GAP, row.id]
        );
      }
      previousRank = await loadNeighborRank(previousTaskId);
      nextRank = await loadNeighborRank(nextTaskId);
      newRank = rankBetween(previousRank, nextRank);
    }

    await client.query(
      "UPDATE tasks SET rank = $1, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
      [newRank, task.id]
    );
    const updated = await selectTaskById(client, task.id, req.user.id);
    await client.query("COMMIT");
    return res.status(200).json({ data: updated });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

// Zero-fills the last 14 days (including today) so the chart always has a
// complete series - the query only returns rows for days with completions.
const buildDailyCompletions = (rows) => {
  const byDay = new Map(
    rows.map((row) => [new Date(row.day).toISOString().slice(0, 10), row.count])
  );
  const days = [];
  for (let offset = 13; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    const key = date.toISOString().slice(0, 10);
    days.push({ date: key, count: byDay.get(key) || 0 });
  }
  return days;
};

const getTaskStats = async (req, res) => {
  const values = [req.user.id];
  const visible = visibleTaskCondition(1, values);
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
       COALESCE(SUM(CASE WHEN priority = 'medium' THEN 1 ELSE 0 END), 0)::int AS medium_priority_tasks,
       COALESCE(SUM(CASE WHEN priority = 'low' THEN 1 ELSE 0 END), 0)::int AS low_priority_tasks,
       COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE AND status <> 'completed' THEN 1 ELSE 0 END), 0)::int AS overdue_tasks
     FROM tasks t
     LEFT JOIN projects p ON p.id = t.project_id
     WHERE ${visible}${projectCondition}
       AND t.archived_at IS NULL
       AND (t.project_id IS NULL OR p.archived_at IS NULL)`,
    values
  );
  // Grouped on a plain ::date cast rather than to_char(), which pg-mem (used
  // by the test suite) doesn't implement - the day is stringified in JS instead.
  const trendResult = await req.app.locals.db.query(
    `SELECT t.updated_at::date AS day, COUNT(*)::int AS count
     FROM tasks t
     LEFT JOIN projects p ON p.id = t.project_id
     WHERE ${visible}${projectCondition}
       AND t.archived_at IS NULL
       AND (t.project_id IS NULL OR p.archived_at IS NULL)
       AND status = 'completed'
       AND t.updated_at::date >= (CURRENT_DATE - 13)
     GROUP BY day
     ORDER BY day ASC`,
    values
  );
  return res.status(200).json({
    data: { ...result.rows[0], daily_completions: buildDailyCompletions(trendResult.rows) }
  });
};

module.exports = {
  archiveTask,
  createChildTask,
  createTask,
  deleteTask,
  getTaskById,
  getTaskChildren,
  getTasks,
  getTaskStats,
  restoreTask,
  updateTask,
  updateTaskRank
};
