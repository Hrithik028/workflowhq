const { logActivity } = require("../lib/activity");
const { AppError } = require("../lib/errors");
const { getProjectRole } = require("../lib/projectAccess");

const countOwners = async (db, projectId) => {
  const result = await db.query(
    "SELECT COUNT(*)::int AS count FROM project_members WHERE project_id = $1 AND role = 'owner'",
    [projectId]
  );
  return Number(result.rows[0].count);
};

const listMembers = async (req, res, next) => {
  const db = req.app.locals.db;
  const role = await getProjectRole(db, req.params.id, req.user.id);
  if (!role) {
    return next(new AppError(404, "PROJECT_NOT_FOUND", "Project not found."));
  }
  const result = await db.query(
    `SELECT pm.user_id, u.name, u.email, pm.role, pm.created_at
     FROM project_members pm
     JOIN users u ON u.id = pm.user_id
     WHERE pm.project_id = $1
     ORDER BY pm.created_at ASC, pm.user_id ASC`,
    [req.params.id]
  );
  return res.status(200).json({
    data: result.rows.map((row) => ({
      userId: row.user_id,
      name: row.name,
      email: row.email,
      role: row.role,
      addedAt: row.created_at
    }))
  });
};

const addMember = async (req, res, next) => {
  const db = req.app.locals.db;
  const callerRole = await getProjectRole(db, req.params.id, req.user.id);
  if (!callerRole) {
    return next(new AppError(404, "PROJECT_NOT_FOUND", "Project not found."));
  }
  if (callerRole !== "owner") {
    return next(
      new AppError(403, "PROJECT_OWNER_REQUIRED", "Only a project owner can add members.")
    );
  }

  // Exact, case-insensitive email match only - no browsable directory, so this
  // can't be used to enumerate the platform's users.
  const targetResult = await db.query("SELECT id, name, email FROM users WHERE email = $1", [
    req.body.email
  ]);
  if (targetResult.rows.length === 0) {
    return next(new AppError(404, "USER_NOT_FOUND", "No user with that email exists."));
  }
  const target = targetResult.rows[0];
  if (Number(target.id) === Number(req.user.id)) {
    return next(
      new AppError(409, "PROJECT_MEMBER_EXISTS", "You are already a member of this project.")
    );
  }
  const existingRole = await getProjectRole(db, req.params.id, target.id);
  if (existingRole) {
    return next(
      new AppError(409, "PROJECT_MEMBER_EXISTS", "This user is already a member of the project.")
    );
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO project_members (project_id, user_id, role, invited_by)
       VALUES ($1, $2, $3, $4)`,
      [req.params.id, target.id, req.body.role, req.user.id]
    );
    await logActivity(client, {
      userId: req.user.id,
      action: "project_member_added",
      entityType: "project",
      entityId: Number(req.params.id),
      entityTitle: target.email,
      details: { role: req.body.role, targetUserId: target.id }
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return res.status(201).json({
    data: { userId: target.id, name: target.name, email: target.email, role: req.body.role }
  });
};

const updateMemberRole = async (req, res, next) => {
  const db = req.app.locals.db;
  const callerRole = await getProjectRole(db, req.params.id, req.user.id);
  if (!callerRole) {
    return next(new AppError(404, "PROJECT_NOT_FOUND", "Project not found."));
  }
  if (callerRole !== "owner") {
    return next(
      new AppError(403, "PROJECT_OWNER_REQUIRED", "Only a project owner can change member roles.")
    );
  }

  const targetUserId = Number(req.params.userId);
  const targetRole = await getProjectRole(db, req.params.id, targetUserId);
  if (!targetRole) {
    return next(
      new AppError(404, "PROJECT_MEMBER_NOT_FOUND", "This user is not a member of the project.")
    );
  }

  if (targetRole === "owner" && req.body.role !== "owner") {
    const owners = await countOwners(db, req.params.id);
    if (owners <= 1) {
      return next(
        new AppError(409, "LAST_OWNER_REQUIRED", "A project must keep at least one owner.")
      );
    }
  }

  await db.query("UPDATE project_members SET role = $1 WHERE project_id = $2 AND user_id = $3", [
    req.body.role,
    req.params.id,
    targetUserId
  ]);
  return res.status(200).json({ data: { userId: targetUserId, role: req.body.role } });
};

const removeMember = async (req, res, next) => {
  const db = req.app.locals.db;
  const callerRole = await getProjectRole(db, req.params.id, req.user.id);
  if (!callerRole) {
    return next(new AppError(404, "PROJECT_NOT_FOUND", "Project not found."));
  }

  const targetUserId = Number(req.params.userId);
  const isSelf = Number(req.user.id) === targetUserId;
  if (!isSelf && callerRole !== "owner") {
    return next(
      new AppError(403, "PROJECT_OWNER_REQUIRED", "Only a project owner can remove other members.")
    );
  }

  const targetRole = await getProjectRole(db, req.params.id, targetUserId);
  if (!targetRole) {
    return next(
      new AppError(404, "PROJECT_MEMBER_NOT_FOUND", "This user is not a member of the project.")
    );
  }

  if (targetRole === "owner") {
    const owners = await countOwners(db, req.params.id);
    if (owners <= 1) {
      return next(
        new AppError(
          409,
          "LAST_OWNER_REQUIRED",
          "Promote another member to owner before removing the last owner."
        )
      );
    }
  }

  await db.query("DELETE FROM project_members WHERE project_id = $1 AND user_id = $2", [
    req.params.id,
    targetUserId
  ]);
  return res.status(204).send();
};

module.exports = { addMember, listMembers, removeMember, updateMemberRole };
