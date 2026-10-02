const { AppError } = require("../lib/errors");

const notFound = (req, _res, next) => {
  next(new AppError(404, "ROUTE_NOT_FOUND", `Route ${req.method} ${req.path} was not found.`));
};

const safeErrorForLog = (error, req, code) => {
  const path = (req.originalUrl || req.path).split("?", 1)[0];
  if (
    /^\/(?:api\/)?ai\/credentials(?:\/|$)/u.test(path) ||
    /^\/(?:api\/)?projects\/\d+\/ai-plan(?:\/|$)/u.test(path)
  ) {
    return code;
  }
  return error.message;
};

const errorHandler = (error, req, res, _next) => {
  const status = error.status || 500;
  const isServerError = status >= 500;
  const code = error instanceof AppError ? error.code : "INTERNAL_ERROR";
  const message = isServerError ? "Something went wrong on the server." : error.message;

  const log = {
    level: isServerError ? "error" : "warn",
    message: "request_error",
    requestId: req.id,
    method: req.method,
    path: req.path,
    status,
    error: safeErrorForLog(error, req, code)
  };
  if (req.app.locals.config?.nodeEnv !== "test") {
    process.stderr.write(`${JSON.stringify(log)}\n`);
  }

  const body = { error: { code, message } };
  if (error.details) {
    body.error.details = error.details;
  }

  return res.status(status).json(body);
};

module.exports = { errorHandler, notFound, safeErrorForLog };
