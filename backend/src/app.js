const cookieParser = require("cookie-parser");
const cors = require("cors");
const express = require("express");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");

const pool = require("./config/db");
const { loadConfig } = require("./config/env");
const { AppError } = require("./lib/errors");
const { errorHandler, notFound } = require("./middleware/errorMiddleware");
const { requestLogger } = require("./middleware/requestLogger");
const activityRoutes = require("./routes/activityRoutes");
const adminRoutes = require("./routes/adminRoutes");
const authRoutes = require("./routes/authRoutes");
const githubIntegrationRoutes = require("./routes/githubIntegrationRoutes");
const projectRoutes = require("./routes/projectRoutes");
const taskRoutes = require("./routes/taskRoutes");

const createCorsOptions = (allowedOrigins) => ({
  credentials: true,
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new AppError(403, "CORS_ORIGIN_DENIED", "Origin is not allowed by CORS."));
  }
});

const createApp = ({ db = pool, config = loadConfig() } = {}) => {
  const app = express();
  app.locals.db = db;
  app.locals.config = config;

  if (config.trustProxy) {
    app.set("trust proxy", 1);
  }

  app.use(requestLogger);
  app.use(helmet());
  app.use(cors(createCorsOptions(config.corsOrigins)));
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: () => config.nodeEnv === "test",
    message: {
      error: {
        code: "AUTH_RATE_LIMITED",
        message: "Too many authentication attempts. Please try again later."
      }
    }
  });

  app.get("/api/health", async (_req, res, next) => {
    try {
      await db.query("SELECT 1");
      return res.status(200).json({ status: "ok", database: "connected" });
    } catch (error) {
      return next(error);
    }
  });

  app.use("/api/auth/register", authLimiter);
  app.use("/api/auth/login", authLimiter);
  app.use("/api/auth", authRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/github", githubIntegrationRoutes);
  app.use("/api/projects", projectRoutes);
  app.use("/api/tasks", taskRoutes);
  app.use("/api/activity", activityRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
};

module.exports = { createApp };
