const { AppError } = require("./errors");

const permissionKeys = [
  "projects.create",
  "projects.edit",
  "projects.delete",
  "projects.members",
  "tasks.create",
  "tasks.edit",
  "tasks.delete",
  "github.manage"
];

const defaultPermissions = Object.fromEntries(permissionKeys.map((key) => [key, true]));

const readCurrentAccess = async (db, userId) => {
  const result = await db.query(
    `SELECT u.id, u.role, p.permission_key, p.allowed
     FROM users u
     LEFT JOIN user_permissions p ON p.user_id = u.id
     WHERE u.id = $1`,
    [userId]
  );
  if (result.rows.length === 0) {
    throw new AppError(401, "AUTH_USER_MISSING", "This account is no longer available.");
  }
  const role = result.rows[0].role;
  const permissions = { ...defaultPermissions };
  for (const row of result.rows) {
    if (row.permission_key) permissions[row.permission_key] = row.allowed;
  }
  return { role, permissions };
};

const readWorkspaceRules = async (db) => {
  const result = await db.query("SELECT rule_key, rule_value FROM workspace_rules");
  return Object.fromEntries(result.rows.map((row) => [row.rule_key, row.rule_value]));
};

module.exports = { defaultPermissions, permissionKeys, readCurrentAccess, readWorkspaceRules };
