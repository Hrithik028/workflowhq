const { randomUUID } = require("node:crypto");

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

const resolveRequestId = (candidate) =>
  typeof candidate === "string" && REQUEST_ID_PATTERN.test(candidate) ? candidate : randomUUID();

const requestLogger = (req, res, next) => {
  const startedAt = process.hrtime.bigint();
  req.id = resolveRequestId(req.get("x-request-id"));
  res.setHeader("x-request-id", req.id);

  res.on("finish", () => {
    if (req.app.locals.config?.nodeEnv === "test") {
      return;
    }

    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    process.stdout.write(
      `${JSON.stringify({
        level: "info",
        message: "request_complete",
        requestId: req.id,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Number(durationMs.toFixed(1))
      })}\n`
    );
  });

  next();
};

module.exports = { requestLogger, resolveRequestId };
