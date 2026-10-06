const { readCurrentAccess, readWorkspaceRules } = require("../lib/accessControl");
const { AppError } = require("../lib/errors");
const { queryInWorkspace } = require("../lib/workspaceContext");

const requireAdmin = async (req, _res, next) => {
  try {
    const access = await readCurrentAccess(req.app.locals.db, req.user.id);
    req.user.role = access.role;
    if (
      (req.app.locals.config.workspacesEnabled && access.role !== "platform_owner") ||
      (access.role !== "admin" && access.role !== "platform_owner")
    ) {
      return next(new AppError(403, "ADMIN_REQUIRED", "Administrator access is required."));
    }
    return next();
  } catch (error) {
    return next(error);
  }
};

const requirePlatformOwner = async (req, _res, next) => {
  try {
    const access = await readCurrentAccess(req.app.locals.db, req.user.id);
    req.user.role = access.role;
    if (access.role !== "platform_owner") {
      return next(
        new AppError(403, "PLATFORM_OWNER_REQUIRED", "Platform owner access is required.")
      );
    }
    return next();
  } catch (error) {
    return next(error);
  }
};

const requirePermission = (permissionKey) => async (req, _res, next) => {
  try {
    const access = await readCurrentAccess(req.app.locals.db, req.user.id);
    req.user.role = access.role;
    if (permissionKey === "github.manage" && req.user.workspaceId) {
      const member = (
        await req.app.locals.db.query(
          "SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2",
          [req.user.workspaceId, req.user.id]
        )
      ).rows[0];
      if (!member || !["owner", "admin"].includes(member.role))
        return next(
          new AppError(
            403,
            "WORKSPACE_ADMIN_REQUIRED",
            "Workspace administrator access is required to manage GitHub."
          )
        );
    }
    if (
      access.role !== "admin" &&
      access.role !== "platform_owner" &&
      access.permissions[permissionKey] !== true
    ) {
      return next(
        new AppError(403, "PERMISSION_DENIED", `Your role cannot perform ${permissionKey}.`)
      );
    }
    return next();
  } catch (error) {
    return next(error);
  }
};

const requireRule = (ruleKey) => async (req, _res, next) => {
  try {
    const rules = await readWorkspaceRules(req.app.locals.db);
    if (rules[ruleKey] !== true) {
      return next(
        new AppError(403, "WORKSPACE_RULE_BLOCKED", "A workspace rule blocks this action.")
      );
    }
    return next();
  } catch (error) {
    return next(error);
  }
};

const enforceTaskRules =
  ({ creating = false } = {}) =>
  async (req, _res, next) => {
    try {
      const rules = await readWorkspaceRules(req.app.locals.db);
      if (
        rules.require_due_date_for_high_priority === true &&
        req.body.priority === "high" &&
        !req.body.dueDate
      ) {
        return next(
          new AppError(
            422,
            "HIGH_PRIORITY_DUE_DATE_REQUIRED",
            "High-priority work requires a due date under the current workspace rules."
          )
        );
      }
      if (creating && req.body.status !== "completed") {
        const limit = Number(rules.max_open_tasks_per_user || 100);
        const result = await queryInWorkspace(
          req.app.locals.db,
          "SELECT COUNT(*)::int AS count FROM tasks t WHERE user_id = $1 AND status <> 'completed' AND archived_at IS NULL /* workspace */",
          [req.user.id],
          "t"
        );
        if (Number(result.rows[0].count) >= limit) {
          return next(
            new AppError(
              409,
              "OPEN_TASK_LIMIT_REACHED",
              `This workspace allows ${limit} open tasks per user.`
            )
          );
        }
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };

module.exports = {
  enforceTaskRules,
  requireAdmin,
  requirePermission,
  requirePlatformOwner,
  requireRule
};
