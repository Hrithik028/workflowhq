const jwt = require("jsonwebtoken");

const { AppError } = require("../lib/errors");

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
      `SELECT u.auth_version
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

    req.user = {
      id: Number(decoded.sub),
      email: decoded.email,
      role: decoded.role,
      sessionId: Number(decoded.sessionId)
    };
    return next();
  } catch {
    return next(
      new AppError(401, "AUTH_TOKEN_INVALID", "Your session has expired. Please sign in again.")
    );
  }
};

module.exports = authMiddleware;
