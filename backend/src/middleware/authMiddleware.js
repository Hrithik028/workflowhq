const jwt = require("jsonwebtoken");

const { AppError } = require("../lib/errors");

const authMiddleware = (req, _res, next) => {
  const authHeader = req.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return next(new AppError(401, "AUTH_REQUIRED", "Authentication is required."));
  }

  try {
    const decoded = jwt.verify(authHeader.slice(7), req.app.locals.config.jwtSecret);
    if (decoded.type !== "access") {
      throw new Error("Unexpected token type.");
    }

    req.user = {
      id: Number(decoded.sub),
      email: decoded.email,
      role: decoded.role
    };
    return next();
  } catch {
    return next(
      new AppError(401, "AUTH_TOKEN_INVALID", "Your session has expired. Please sign in again.")
    );
  }
};

module.exports = authMiddleware;
