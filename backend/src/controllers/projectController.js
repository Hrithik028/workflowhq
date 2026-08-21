const { logActivity } = require("../lib/activity");
const { AppError } = require("../lib/errors");

const getProjects = async (req, res) => {
  const result = await req.app.locals.db.query(
    `SELECT p.id, p.user_id, p.name, p.description, p.created_at, p.updated_at,
            COUNT(t.id)::int AS task_count,
            COALESCE(SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END), 0)::int AS completed_count
     FROM projects p
     LEFT JOIN tasks t ON t.project_id = p.id AND t.user_id = p.user_id
     WHERE p.user_id = $1
     GROUP BY p.id
     ORDER BY p.updated_at DESC, p.id DESC`,
    [req.user.id]
  );
  return res.status(200).json({ data: result.rows });
};

const getProjectById = async (req, res, next) => {
  const result = await req.app.locals.db.query(
    `SELECT p.id, p.user_id, p.name, p.description, p.created_at, p.updated_at,
            COUNT(t.id)::int AS task_count,
            COALESCE(SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END), 0)::int AS completed_count
     FROM projects p
     LEFT JOIN tasks t ON t.project_id = p.id AND t.user_id = p.user_id
     WHERE p.id = $1 AND p.user_id = $2
     GROUP BY p.id`,
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
      `INSERT INTO projects (user_id, name, description)
       VALUES ($1, $2, $3)
       RETURNING id, user_id, name, description, created_at, updated_at`,
      [req.user.id, req.body.name, req.body.description]
    );
    const project = result.rows[0];
    await logActivity(client, {
      userId: req.user.id,
      action: "project_created",
      entityType: "project",
      entityId: project.id,
      entityTitle: project.name
    });
    await client.query("COMMIT");
    return res.status(201).json({ data: { ...project, task_count: 0, completed_count: 0 } });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const updateProject = async (req, res, next) => {
  const result = await req.app.locals.db.query(
    `UPDATE projects SET name = $1, description = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $3 AND user_id = $4
     RETURNING id, user_id, name, description, created_at, updated_at`,
    [req.body.name, req.body.description, req.params.id, req.user.id]
  );
  if (result.rows.length === 0) {
    return next(new AppError(404, "PROJECT_NOT_FOUND", "Project not found."));
  }
  return res.status(200).json({ data: result.rows[0] });
};

const deleteProject = async (req, res, next) => {
  const db = req.app.locals.db;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      "DELETE FROM projects WHERE id = $1 AND user_id = $2 RETURNING id, name",
      [req.params.id, req.user.id]
    );
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
