const { z } = require("zod");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().max(65535).default(5000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required."),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters."),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().positive().max(30).default(7),
  REFRESH_COOKIE_NAME: z.string().default("workflowhq_refresh"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).optional(),
  TRUST_PROXY: z.enum(["true", "false"]).default("false")
});

const loadConfig = (overrides = {}) => {
  const values = envSchema.parse({ ...process.env, ...overrides });

  return {
    nodeEnv: values.NODE_ENV,
    port: values.PORT,
    databaseUrl: values.DATABASE_URL,
    jwtSecret: values.JWT_SECRET,
    accessTokenTtl: values.ACCESS_TOKEN_TTL,
    refreshTokenDays: values.REFRESH_TOKEN_DAYS,
    refreshCookieName: values.REFRESH_COOKIE_NAME,
    corsOrigins: values.CORS_ORIGIN.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    cookieSameSite: values.COOKIE_SAME_SITE || (values.NODE_ENV === "production" ? "none" : "lax"),
    secureCookies: values.NODE_ENV === "production",
    trustProxy: values.TRUST_PROXY === "true"
  };
};

module.exports = { loadConfig };
