const { AppError } = require("./errors");
const { currentWorkspace } = require("./workspaceContext");

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

const readWorkspaceRules = async (db, workspaceId = currentWorkspace()) => {
  const result = await db.query("SELECT rule_key, rule_value FROM workspace_rules");
  const rules = Object.fromEntries(result.rows.map((row) => [row.rule_key, row.rule_value]));
  if (!workspaceId) return rules;
  const settings =
    (await db.query("SELECT rules FROM workspace_settings WHERE workspace_id = $1", [workspaceId]))
      .rows[0]?.rules || {};
  return {
    ...rules,
    allow_task_deletion:
      rules.allow_task_deletion === true && settings.allow_task_deletion !== false,
    allow_project_deletion:
      rules.allow_project_deletion === true && settings.allow_project_deletion !== false,
    require_due_date_for_high_priority:
      rules.require_due_date_for_high_priority === true ||
      settings.require_due_date_for_high_priority === true,
    max_open_tasks_per_user: Math.min(
      Number(rules.max_open_tasks_per_user || 100),
      Number(settings.max_open_tasks_per_user || 1000)
    )
  };
};

module.exports = { defaultPermissions, permissionKeys, readCurrentAccess, readWorkspaceRules };
