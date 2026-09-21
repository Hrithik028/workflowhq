const { rateLimit } = require("express-rate-limit");

const { AppError } = require("../lib/errors");

const createRateLimiter = ({ config, limit, code, message }) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: () => config.nodeEnv === "test",
    message: { error: { code, message } }
  });

const requireTrustedOrigin = (req, _res, next) => {
  const config = req.app.locals.config;
  const origin = req.get("origin");

  if (origin && config.corsOrigins.includes(origin)) {
    return next();
  }

  // Local tools and automated tests do not always send an Origin header. In
  // production, cookie-backed authentication endpoints fail closed.
  if (!origin && config.nodeEnv !== "production") {
    return next();
  }

  return next(
    new AppError(
      403,
      "TRUSTED_ORIGIN_REQUIRED",
      "This authentication request did not come from an allowed WorkflowHQ origin."
    )
  );
};

module.exports = { createRateLimiter, requireTrustedOrigin };
