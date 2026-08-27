const { logActivity } = require("../lib/activity");
const { AppError } = require("../lib/errors");
const { getProjectRole } = require("../lib/projectAccess");

const getProjects = async (req, res) => {
  const result = await req.app.locals.db.query(
    `SELECT p.id, p.user_id, p.key, p.name, p.description, p.created_at, p.updated_at,
            pm.role AS my_role,
            COUNT(t.id)::int AS task_count,
            COALESCE(SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END), 0)::int AS completed_count
     FROM projects p
     JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $1
     LEFT JOIN tasks t ON t.project_id = p.id
     GROUP BY p.id, pm.role
     ORDER BY p.updated_at DESC, p.id DESC`,
    [req.user.id]
  );
  return res.status(200).json({ data: result.rows });
};

const getProjectById = async (req, res, next) => {
  const result = await req.app.locals.db.query(
    `SELECT p.id, p.user_id, p.key, p.name, p.description, p.created_at, p.updated_at,
            pm.role AS my_role,
            COUNT(t.id)::int AS task_count,
            COALESCE(SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END), 0)::int AS completed_count
     FROM projects p
     JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $2
     LEFT JOIN tasks t ON t.project_id = p.id
     WHERE p.id = $1
     GROUP BY p.id, pm.role`,
    [req.params.id, req.user.id]
  );
  if (result.rows.length === 0) {
    return next(new AppError(404, "PROJECT_NOT_FOUND", "Project not found."));
  }
  return res.status(200).json({ data: result.rows[0] });
};

const createProject = async (req, res) => {
  const db = req.app.locals.db;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO projects (user_id, key, name, description)
       VALUES ($1, $2, $3, $4)
       RETURNING id, user_id, key, name, description, created_at, updated_at`,
      [req.user.id, req.body.key, req.body.name, req.body.description]
    );
    const project = result.rows[0];
    // The creator always becomes the project's first owner. projects.user_id
    // itself never changes after this (see migration 006's composite FKs) -
    // all further "who can access/edit this project" logic lives here instead.
    await client.query(
      `INSERT INTO project_members (project_id, user_id, role, invited_by)
       VALUES ($1, $2, 'owner', $2)`,
      [project.id, req.user.id]
    );
    await logActivity(client, {
      userId: req.user.id,
      action: "project_created",
      entityType: "project",
      entityId: project.id,
      entityTitle: project.name
    });
    await client.query("COMMIT");
    return res
      .status(201)
      .json({ data: { ...project, my_role: "owner", task_count: 0, completed_count: 0 } });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") {
      throw new AppError(409, "PROJECT_KEY_EXISTS", "That project key is already in use.");
    }
    throw error;
  } finally {
    client.release();
  }
};

const updateProject = async (req, res, next) => {
  const db = req.app.locals.db;
  // Project settings are owner-only, not just any member's to change.
  const role = await getProjectRole(db, req.params.id, req.user.id);
  if (role !== "owner") {
    return next(new AppError(404, "PROJECT_NOT_FOUND", "Project not found."));
  }
  const current = await db.query(
    `SELECT p.id, p.key, COUNT(t.id)::int AS task_count
     FROM projects p
     LEFT JOIN tasks t ON t.project_id = p.id
     WHERE p.id = $1
     GROUP BY p.id`,
    [req.params.id]
  );
  if (current.rows.length === 0) {
    return next(new AppError(404, "PROJECT_NOT_FOUND", "Project not found."));
  }
  if (current.rows[0].key !== req.body.key && current.rows[0].task_count > 0) {
    return next(
      new AppError(
        409,
        "PROJECT_KEY_LOCKED",
        "A project key cannot change after its first ticket is created."
      )
    );
  }

  try {
    const result = await db.query(
      `UPDATE projects SET key = $1, name = $2, description = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING id, user_id, key, name, description, created_at, updated_at`,
      [req.body.key, req.body.name, req.body.description, req.params.id]
    );
    return res.status(200).json({ data: { ...result.rows[0], my_role: "owner" } });
  } catch (error) {
    if (error.code === "23505") {
      return next(new AppError(409, "PROJECT_KEY_EXISTS", "That project key is already in use."));
    }
    throw error;
  }
};

const deleteProject = async (req, res, next) => {
  const db = req.app.locals.db;
  // Deletion is owner-only, same as updateProject.
  const role = await getProjectRole(db, req.params.id, req.user.id);
  if (role !== "owner") {
    return next(new AppError(404, "PROJECT_NOT_FOUND", "Project not found."));
  }
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query("DELETE FROM projects WHERE id = $1 RETURNING id, name", [
      req.params.id
    ]);
    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return next(new AppError(404, "PROJECT_NOT_FOUND", "Project not found."));
    }
    await logActivity(client, {
      userId: req.user.id,
      action: "project_deleted",
      entityType: "project",
      entityTitle: result.rows[0].name
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

module.exports = { createProject, deleteProject, getProjectById, getProjects, updateProject };
