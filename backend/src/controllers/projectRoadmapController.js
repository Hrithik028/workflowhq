const { logActivity } = require("../lib/activity");
const { AppError } = require("../lib/errors");
const { getProjectRole } = require("../lib/projectAccess");

const requireProject = async (db, projectId, userId, editing = false) => {
  const role = await getProjectRole(db, projectId, userId);
  if (!role) throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");
  if (editing && role === "viewer") {
    throw new AppError(
      403,
      "PROJECT_EDITOR_REQUIRED",
      "Only project editors can manage dependencies."
    );
  }
  const project = (
    await db.query("SELECT id, key, name, archived_at FROM projects WHERE id = $1", [projectId])
  ).rows[0];
  if (!project) throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");
  if (editing && project.archived_at) {
    throw new AppError(
      409,
      "PROJECT_ARCHIVED",
      "Restore the project before changing dependencies."
    );
  }
  return { ...project, my_role: role };
};

const selectDependencies = async (db, projectId) => {
  const result = await db.query(
    `SELECT blocker_task_id, blocked_task_id, created_at
     FROM task_dependencies WHERE project_id = $1
     ORDER BY blocker_task_id, blocked_task_id`,
    [projectId]
  );
  return result.rows.map((row) => ({
    blockerTaskId: Number(row.blocker_task_id),
    blockedTaskId: Number(row.blocked_task_id),
    createdAt: row.created_at
  }));
};

const listProjectRoadmap = async (req, res) => {
  const db = req.app.locals.db;
  const project = await requireProject(db, req.params.id, req.user.id);
  const result = await db.query(
    `SELECT id, issue_key, title, task_type, status, workflow_stage, start_date, due_date, parent_task_id
     FROM tasks WHERE project_id = $1 AND archived_at IS NULL
     ORDER BY due_date ASC NULLS LAST, id ASC`,
    [project.id]
  );
  const taskIds = new Set(result.rows.map((row) => Number(row.id)));
  const dependencies = (await selectDependencies(db, project.id)).filter(
    (edge) => taskIds.has(edge.blockerTaskId) && taskIds.has(edge.blockedTaskId)
  );
  return res.status(200).json({
    data: {
      project: {
        id: Number(project.id),
        key: project.key,
        name: project.name,
        myRole: project.my_role
      },
      tasks: result.rows,
      dependencies
    }
  });
};

const wouldCreateCycle = (dependencies, blockerTaskId, blockedTaskId) => {
  const visited = new Set();
  const pending = [blockedTaskId];
  while (pending.length) {
    const current = pending.pop();
    if (current === blockerTaskId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const edge of dependencies) {
      if (edge.blockerTaskId === current) pending.push(edge.blockedTaskId);
    }
  }
  return false;
};

const createTaskDependency = async (req, res) => {
  const db = req.app.locals.db;
  const projectId = Number(req.params.id);
  const { blockerTaskId, blockedTaskId } = req.body;
  await requireProject(db, projectId, req.user.id, true);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    // Serialize edits within one project so concurrent requests cannot create a cycle.
    await client.query("SELECT id FROM projects WHERE id = $1 FOR UPDATE", [projectId]);
    const tasks = await client.query(
      `SELECT id, issue_key, title, archived_at FROM tasks
       WHERE project_id = $1 AND id IN ($2, $3)`,
      [projectId, blockerTaskId, blockedTaskId]
    );
    if (tasks.rows.length !== 2 || tasks.rows.some((task) => task.archived_at)) {
      throw new AppError(
        422,
        "DEPENDENCY_TASK_INVALID",
        "Both active tickets must belong to this project."
      );
    }
    const dependencies = await selectDependencies(client, projectId);
    if (
      dependencies.some(
        (edge) => edge.blockerTaskId === blockerTaskId && edge.blockedTaskId === blockedTaskId
      )
    ) {
      throw new AppError(409, "DEPENDENCY_EXISTS", "This blocking relationship already exists.");
    }
    if (wouldCreateCycle(dependencies, blockerTaskId, blockedTaskId)) {
      throw new AppError(
        409,
        "DEPENDENCY_CYCLE",
        "This relationship would create a blocking cycle."
      );
    }
    await client.query(
      `INSERT INTO task_dependencies (project_id, blocker_task_id, blocked_task_id, created_by)
       VALUES ($1, $2, $3, $4)`,
      [projectId, blockerTaskId, blockedTaskId, req.user.id]
    );
    const blocker = tasks.rows.find((task) => Number(task.id) === blockerTaskId);
    const blocked = tasks.rows.find((task) => Number(task.id) === blockedTaskId);
    await logActivity(client, {
      userId: req.user.id,
      action: "task_dependency_added",
      entityType: "task",
      entityId: blockedTaskId,
      entityTitle: blocked.title,
      details: { blockerIssueKey: blocker.issue_key, blockedIssueKey: blocked.issue_key }
    });
    await client.query("COMMIT");
    return res.status(201).json({ data: { blockerTaskId, blockedTaskId } });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const deleteTaskDependency = async (req, res) => {
  const db = req.app.locals.db;
  const projectId = Number(req.params.id);
  await requireProject(db, projectId, req.user.id, true);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `DELETE FROM task_dependencies
       WHERE project_id = $1 AND blocker_task_id = $2 AND blocked_task_id = $3
       RETURNING blocked_task_id`,
      [projectId, req.params.blockerTaskId, req.params.blockedTaskId]
    );
    if (!result.rows[0]) throw new AppError(404, "DEPENDENCY_NOT_FOUND", "Dependency not found.");
    const blocked = (
      await client.query("SELECT issue_key, title FROM tasks WHERE id = $1", [
        req.params.blockedTaskId
      ])
    ).rows[0];
    await logActivity(client, {
      userId: req.user.id,
      action: "task_dependency_removed",
      entityType: "task",
      entityId: Number(req.params.blockedTaskId),
      entityTitle: blocked?.title || "Ticket",
      details: {
        blockerTaskId: Number(req.params.blockerTaskId),
        blockedIssueKey: blocked?.issue_key
      }
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

module.exports = { listProjectRoadmap, createTaskDependency, deleteTaskDependency };
