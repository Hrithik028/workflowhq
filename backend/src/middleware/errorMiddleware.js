const { AppError } = require("../lib/errors");

const notFound = (req, _res, next) => {
  next(new AppError(404, "ROUTE_NOT_FOUND", `Route ${req.method} ${req.path} was not found.`));
};

const safeErrorForLog = (error, req, code) => {
  const path = (req.originalUrl || req.path).split("?", 1)[0];
  if (
    /^\/(?:api\/)?ai\/credentials(?:\/|$)/u.test(path) ||
    /^\/(?:api\/)?projects\/\d+\/(?:ai-plan|ai-conversations)(?:\/|$)/u.test(path)
  ) {
    return code;
  }
  return error.message;
};

const safeAiPlanDiagnostics = (error) => {
  if (!(error instanceof AppError) || error.code !== "AI_PLAN_INVALID") return undefined;
  const stage = error.details?.stage;
  if (!["json_parse", "schema_validation", "item_limit"].includes(stage)) return undefined;
  const fields = new Set([
    "summary",
    "tasks",
    "tempId",
    "parentTempId",
    "taskType",
    "title",
    "description",
    "priority",
    "dueDate",
    "evidenceIds",
    "acceptanceCriteria",
    "field"
  ]);
  const codes = new Set([
    "invalid_type",
    "too_big",
    "too_small",
    "invalid_format",
    "invalid_value",
    "invalid_union",
    "unrecognized_keys",
    "custom"
  ]);
  return {
    stage,
    issues: (Array.isArray(error.details?.issues) ? error.details.issues : [])
      .slice(0, 12)
      .map((issue) => ({
        code: codes.has(issue?.code) ? issue.code : "invalid_value",
        path: String(issue?.path || "")
          .slice(0, 200)
          .split(".")
          .map((part) => (fields.has(part) || /^\d{1,4}$/u.test(part) ? part : "field"))
          .join(".")
      }))
  };
};

const errorHandler = (error, req, res, _next) => {
  const status = error.status || 500;
  const isServerError = status >= 500;
  const code = error instanceof AppError ? error.code : "INTERNAL_ERROR";
  const diagnostics = safeAiPlanDiagnostics(error);
  const message =
    error instanceof AppError && code === "AI_PLAN_INVALID"
      ? "The AI response did not meet the required plan format. No tickets were created. Review the goal or try another revision."
      : isServerError
        ? "Something went wrong on the server."
        : error.message;

  const log = {
    level: isServerError ? "error" : "warn",
    message: "request_error",
    requestId: req.id,
    method: req.method,
    path: req.path,
    status,
    error: safeErrorForLog(error, req, code)
  };
  if (diagnostics) log.validation = diagnostics;
  if (req.app.locals.config?.nodeEnv !== "test") {
    process.stderr.write(`${JSON.stringify(log)}\n`);
  }

  const body = { error: { code, message } };
  if (error.details) {
    body.error.details = code === "AI_PLAN_INVALID" ? diagnostics : error.details;
  }

  return res.status(status).json(body);
};

module.exports = { errorHandler, notFound, safeErrorForLog, safeAiPlanDiagnostics };
