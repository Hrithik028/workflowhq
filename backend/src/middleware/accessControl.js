const { readCurrentAccess, readWorkspaceRules } = require("../lib/accessControl");
const { AppError } = require("../lib/errors");

const requireAdmin = async (req, _res, next) => {
  try {
    const access = await readCurrentAccess(req.app.locals.db, req.user.id);
    req.user.role = access.role;
    if (access.role !== "admin") {
      return next(new AppError(403, "ADMIN_REQUIRED", "Administrator access is required."));
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
    if (access.role !== "admin" && access.permissions[permissionKey] !== true) {
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
        const result = await req.app.locals.db.query(
          "SELECT COUNT(*)::int AS count FROM tasks WHERE user_id = $1 AND status <> 'completed'",
          [req.user.id]
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

module.exports = { enforceTaskRules, requireAdmin, requirePermission, requireRule };
