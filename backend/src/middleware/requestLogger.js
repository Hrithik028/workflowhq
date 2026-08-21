const { randomUUID } = require("node:crypto");

const requestLogger = (req, res, next) => {
  const startedAt = process.hrtime.bigint();
  req.id = req.get("x-request-id") || randomUUID();
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
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Number(durationMs.toFixed(1))
      })}\n`
    );
  });

  next();
};

module.exports = { requestLogger };
