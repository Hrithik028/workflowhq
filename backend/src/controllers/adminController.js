const { defaultPermissions, permissionKeys, readWorkspaceRules } = require("../lib/accessControl");
const { AppError } = require("../lib/errors");

const listUsers = async (db) => {
  const [result, permissionResult, projectCounts, taskCounts] = await Promise.all([
    db.query("SELECT id, name, email, role, created_at FROM users ORDER BY created_at ASC"),
    db.query("SELECT user_id, permission_key, allowed FROM user_permissions"),
    db.query("SELECT user_id, COUNT(*)::int AS count FROM projects GROUP BY user_id"),
    db.query("SELECT user_id, COUNT(*)::int AS count FROM tasks GROUP BY user_id")
  ]);
  const permissionMap = new Map();
  const projectCountMap = new Map(
    projectCounts.rows.map((row) => [Number(row.user_id), Number(row.count)])
  );
  const taskCountMap = new Map(
    taskCounts.rows.map((row) => [Number(row.user_id), Number(row.count)])
  );
  for (const row of permissionResult.rows) {
    if (!permissionMap.has(Number(row.user_id))) permissionMap.set(Number(row.user_id), {});
    permissionMap.get(Number(row.user_id))[row.permission_key] = row.allowed;
  }
  return result.rows
    .map((user) => ({
      ...user,
      project_count: projectCountMap.get(Number(user.id)) || 0,
      task_count: taskCountMap.get(Number(user.id)) || 0,
      permissions: { ...defaultPermissions, ...(permissionMap.get(Number(user.id)) || {}) }
    }))
    .sort((left, right) => (left.role === "admin" ? -1 : right.role === "admin" ? 1 : 0));
};

const getAdminOverview = async (req, res) => {
  const db = req.app.locals.db;
  const [users, rules, auditResult] = await Promise.all([
    listUsers(db),
    readWorkspaceRules(db),
    db.query(
      `SELECT a.id, a.action, a.details, a.created_at,
              admin.name AS admin_name, target.name AS target_name
       FROM admin_audit_log a
       LEFT JOIN users admin ON admin.id = a.admin_user_id
       LEFT JOIN users target ON target.id = a.target_user_id
       ORDER BY a.created_at DESC
       LIMIT 20`
    )
  ]);
  return res.status(200).json({
    data: { users, rules, audit: auditResult.rows, permissionKeys }
  });
};

const updateUserAccess = async (req, res, next) => {
  const db = req.app.locals.db;
  const targetId = Number(req.params.id);
  const targetResult = await db.query("SELECT id, name, role FROM users WHERE id = $1", [targetId]);
  if (targetResult.rows.length === 0) {
    return next(new AppError(404, "USER_NOT_FOUND", "User not found."));
  }
  const target = targetResult.rows[0];
  if (target.role === "admin" && req.body.role !== "admin") {
    const adminCount = await db.query(
      "SELECT COUNT(*)::int AS count FROM users WHERE role = 'admin'"
    );
    if (Number(adminCount.rows[0].count) <= 1) {
      return next(
        new AppError(
          409,
          "LAST_ADMIN_REQUIRED",
          "The workspace must keep at least one administrator."
        )
      );
    }
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("UPDATE users SET role = $1 WHERE id = $2", [req.body.role, targetId]);
    for (const key of permissionKeys) {
      await client.query(
        `INSERT INTO user_permissions (user_id, permission_key, allowed, updated_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
         ON CONFLICT (user_id, permission_key) DO UPDATE
         SET allowed = EXCLUDED.allowed, updated_at = CURRENT_TIMESTAMP`,
        [targetId, key, req.body.permissions[key]]
      );
    }
    await client.query(
      `INSERT INTO admin_audit_log (admin_user_id, target_user_id, action, details)
       VALUES ($1, $2, 'user_access_updated', $3)`,
      [
        req.user.id,
        targetId,
        JSON.stringify({ role: req.body.role, permissions: req.body.permissions })
      ]
    );
    await client.query("COMMIT");
    const users = await listUsers(db);
    return res.status(200).json({ data: users.find((user) => Number(user.id) === targetId) });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const updateWorkspaceRules = async (req, res) => {
  const db = req.app.locals.db;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    for (const [key, value] of Object.entries(req.body)) {
      await client.query(
        `INSERT INTO workspace_rules (rule_key, rule_value, updated_by, updated_at)
         VALUES ($1, $2::jsonb, $3, CURRENT_TIMESTAMP)
         ON CONFLICT (rule_key) DO UPDATE
         SET rule_value = EXCLUDED.rule_value,
             updated_by = EXCLUDED.updated_by,
             updated_at = CURRENT_TIMESTAMP`,
        [key, JSON.stringify(value), req.user.id]
      );
    }
    await client.query(
      `INSERT INTO admin_audit_log (admin_user_id, action, details)
       VALUES ($1, 'workspace_rules_updated', $2)`,
      [req.user.id, JSON.stringify(req.body)]
    );
    await client.query("COMMIT");
    return res.status(200).json({ data: await readWorkspaceRules(db) });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

module.exports = { getAdminOverview, updateUserAccess, updateWorkspaceRules };
