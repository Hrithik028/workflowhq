const { AppError } = require("../lib/errors");
const { getProjectRole } = require("../lib/projectAccess");

const requireProjectEditor = async (db, projectId, userId) => {
  const role = await getProjectRole(db, projectId, userId);
  if (!role) throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");
  if (role !== "owner" && role !== "editor") {
    throw new AppError(
      403,
      "PROJECT_EDITOR_REQUIRED",
      "Only a project editor or owner can manage sprints."
    );
  }
};

const sprintFields = "id, project_id, name, start_date, end_date, status, created_at, updated_at";

const listSprints = async (req, res, next) => {
  const db = req.app.locals.db;
  const role = await getProjectRole(db, req.params.id, req.user.id);
  if (!role) {
    return next(new AppError(404, "PROJECT_NOT_FOUND", "Project not found."));
  }
  const result = await db.query(
    `SELECT ${sprintFields} FROM sprints WHERE project_id = $1 ORDER BY created_at ASC`,
    [req.params.id]
  );
  return res.status(200).json({ data: result.rows });
};

const createSprint = async (req, res, next) => {
  const db = req.app.locals.db;
  try {
    await requireProjectEditor(db, req.params.id, req.user.id);
  } catch (error) {
    return next(error);
  }
  const result = await db.query(
    `INSERT INTO sprints (project_id, name, start_date, end_date)
     VALUES ($1, $2, $3, $4)
     RETURNING ${sprintFields}`,
    [req.params.id, req.body.name, req.body.startDate, req.body.endDate]
  );
  return res.status(201).json({ data: result.rows[0] });
};

const updateSprint = async (req, res, next) => {
  const db = req.app.locals.db;
  try {
    await requireProjectEditor(db, req.params.id, req.user.id);
  } catch (error) {
    return next(error);
  }
  const existing = await db.query("SELECT id, status FROM sprints WHERE id = $1 AND project_id = $2", [
    req.params.sprintId,
    req.params.id
  ]);
  if (existing.rows.length === 0) {
    return next(new AppError(404, "SPRINT_NOT_FOUND", "Sprint not found."));
  }
  if (req.body.status === "active" && existing.rows[0].status !== "active") {
    const activeSprint = await db.query(
      "SELECT id FROM sprints WHERE project_id = $1 AND status = 'active' AND id <> $2",
      [req.params.id, req.params.sprintId]
    );
    if (activeSprint.rows.length > 0) {
      return next(
        new AppError(
          409,
          "SPRINT_ALREADY_ACTIVE",
          "Complete the project's current active sprint before starting another."
        )
      );
    }
  }
  const result = await db.query(
    `UPDATE sprints SET name = $1, start_date = $2, end_date = $3, status = $4,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = $5
     RETURNING ${sprintFields}`,
    [req.body.name, req.body.startDate, req.body.endDate, req.body.status, req.params.sprintId]
  );
  return res.status(200).json({ data: result.rows[0] });
};

const deleteSprint = async (req, res, next) => {
  const db = req.app.locals.db;
  try {
    await requireProjectEditor(db, req.params.id, req.user.id);
  } catch (error) {
    return next(error);
  }
  const result = await db.query("DELETE FROM sprints WHERE id = $1 AND project_id = $2 RETURNING id", [
    req.params.sprintId,
    req.params.id
  ]);
  if (result.rows.length === 0) {
    return next(new AppError(404, "SPRINT_NOT_FOUND", "Sprint not found."));
  }
  return res.status(204).send();
};

module.exports = { createSprint, deleteSprint, listSprints, updateSprint };
