const jwt = require("jsonwebtoken");

const { AppError } = require("../lib/errors");
const { runInWorkspace } = require("../lib/workspaceContext");

const authMiddleware = async (req, _res, next) => {
  const authHeader = req.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return next(new AppError(401, "AUTH_REQUIRED", "Authentication is required."));
  }

  try {
    const decoded = jwt.verify(authHeader.slice(7), req.app.locals.config.jwtSecret);
    if (decoded.type !== "access") {
      throw new Error("Unexpected token type.");
    }
    if (!Number.isSafeInteger(Number(decoded.sessionId))) {
      throw new Error("The access token is not associated with a session.");
    }
    const versionResult = await req.app.locals.db.query(
      `SELECT u.auth_version, rs.workspace_id, rs.workspace_version
       FROM users u
       JOIN refresh_sessions rs ON rs.user_id = u.id
       WHERE u.id = $1 AND rs.id = $2
         AND rs.expires_at > CURRENT_TIMESTAMP`,
      [Number(decoded.sub), Number(decoded.sessionId)]
    );
    if (
      versionResult.rows.length === 0 ||
      Number(versionResult.rows[0].auth_version) !== Number(decoded.authVersion)
    ) {
      throw new Error("The authenticated session is no longer current.");
    }

    const selected = versionResult.rows[0];
    const workspaceId = req.app.locals.config.workspacesEnabled
      ? Number(selected.workspace_id)
      : null;
    if (req.app.locals.config.workspacesEnabled && !workspaceId)
      throw new Error("Workspace selection is missing.");
    if (workspaceId) {
      if (Number(decoded.workspaceVersion || 0) !== Number(selected.workspace_version))
        return next(
          new AppError(
            409,
            "WORKSPACE_SELECTION_CHANGED",
            "Workspace selection changed in another tab. Reload before continuing."
          )
        );
      const membership = await req.app.locals.db.query(
        "SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2",
        [workspaceId, Number(decoded.sub)]
      );
      // A revoked user can still list memberships and select an accessible workspace.
      if (!membership.rows[0] && !req.originalUrl.startsWith("/api/workspaces")) {
        return next(
          new AppError(
            403,
            "WORKSPACE_ACCESS_REVOKED",
            "Your workspace access changed. Select another workspace."
          )
        );
      }
    }

    req.user = {
      id: Number(decoded.sub),
      email: decoded.email,
      role: decoded.role,
      sessionId: Number(decoded.sessionId),
      workspaceId
    };
    return workspaceId ? runInWorkspace(workspaceId, next) : next();
  } catch {
    return next(
      new AppError(401, "AUTH_TOKEN_INVALID", "Your session has expired. Please sign in again.")
    );
  }
};

module.exports = authMiddleware;
