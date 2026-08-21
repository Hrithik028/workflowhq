const { AppError } = require("../lib/errors");

const notFound = (req, _res, next) => {
  next(new AppError(404, "ROUTE_NOT_FOUND", `Route ${req.method} ${req.path} was not found.`));
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
    path: req.originalUrl,
    status,
    error: error.message
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

module.exports = { errorHandler, notFound };
