const { z } = require("zod");

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().max(65535).default(5000),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required."),
    JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters."),
    ACCESS_TOKEN_TTL: z.string().default("15m"),
    REFRESH_TOKEN_DAYS: z.coerce.number().int().positive().max(30).default(7),
    REFRESH_COOKIE_NAME: z.string().default("workflowhq_refresh"),
    CORS_ORIGIN: z.string().default("http://localhost:5173"),
    COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).optional(),
    TRUST_PROXY: z.enum(["true", "false"]).default("false"),
    API_RATE_LIMIT: z.coerce.number().int().min(60).max(5000).default(600),
    EXPENSIVE_ACTION_RATE_LIMIT: z.coerce.number().int().min(5).max(100).default(20),
    WEBHOOK_RATE_LIMIT: z.coerce.number().int().min(30).max(5000).default(600),
    AI_PLANNER_ENABLED: z.enum(["true", "false"]).default("false"),
    AI_DAILY_RUNS_MAX: z.coerce.number().int().min(1).max(1000).default(100),
    AI_PROMPT_CHARACTERS_MAX: z.coerce.number().int().min(1000).max(100000).default(50000),
    AI_OUTPUT_TOKENS_MAX: z.coerce.number().int().min(256).max(20000).default(10000),
    AI_PROPOSED_ACTIONS_MAX: z.coerce.number().int().min(1).max(100).default(50),
    AI_TIMEOUT_MS_MAX: z.coerce.number().int().min(5000).max(60000).default(60000),
    AI_USAGE_RETENTION_DAYS_MAX: z.coerce.number().int().min(1).max(365).default(90),
    AI_PLANNER_TIMEOUT_MS: z.coerce.number().int().min(5000).max(60000).default(30000),
    AI_PLAN_APPROVAL_TTL_MINUTES: z.coerce.number().int().min(5).max(60).default(15),
    AI_CONVERSATION_RETENTION_DAYS: z.coerce.number().int().min(1).max(30).default(15),
    AI_CREDENTIAL_VAULT_ENABLED: z.enum(["true", "false"]).default("false"),
    AI_CREDENTIAL_MASTER_KEYS_JSON: z.string().optional(),
    AI_CREDENTIAL_ACTIVE_KEY_VERSION: z.coerce.number().int().positive().default(1),
    AI_CREDENTIAL_VALIDATION_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(3000)
      .max(30000)
      .default(10000),
    MFA_ENABLED: z.enum(["true", "false"]).default("false"),
    ACCOUNT_ENCRYPTION_KEY_BASE64: z.string().optional(),
    GITHUB_INTEGRATION_ENABLED: z.enum(["true", "false"]).default("false"),
    GITHUB_APP_ID: z.string().regex(/^\d+$/).optional(),
    GITHUB_APP_SLUG: z
      .string()
      .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/)
      .optional(),
    GITHUB_APP_CLIENT_ID: z.string().min(1).optional(),
    GITHUB_APP_CLIENT_SECRET: z.string().min(1).optional(),
    GITHUB_APP_PRIVATE_KEY_BASE64: z.string().min(1).optional(),
    GITHUB_WEBHOOK_SECRET: z.string().min(16).optional(),
    GITHUB_API_VERSION: z.literal("2026-03-10").default("2026-03-10"),
    GITHUB_CONNECT_STATE_TTL_MINUTES: z.coerce.number().int().min(5).max(30).default(10),
    APP_BASE_URL: z.string().url().optional(),
    INVITATION_EMAIL_PROVIDER: z.enum(["disabled", "resend"]).default("disabled"),
    INVITATION_FROM_EMAIL: z.string().trim().min(3).max(320).optional(),
    INVITATION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(168),
    ACCOUNT_EMAIL_PROVIDER: z.enum(["disabled", "resend"]).default("disabled"),
    ACCOUNT_FROM_EMAIL: z.string().trim().min(3).max(320).optional(),
    EMAIL_VERIFICATION_TTL_MINUTES: z.coerce.number().int().min(10).max(10080).default(1440),
    PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(5).max(120).default(30),
    RESEND_API_KEY: z.string().min(1).optional()
  })
  .superRefine((values, context) => {
    if (values.AI_PLANNER_ENABLED === "true" && values.AI_CREDENTIAL_VAULT_ENABLED !== "true") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["AI_CREDENTIAL_VAULT_ENABLED"],
        message: "AI_CREDENTIAL_VAULT_ENABLED must be true when AI planning is enabled."
      });
    }

    if (values.AI_CREDENTIAL_VAULT_ENABLED === "true") {
      let keys;
      try {
        keys = JSON.parse(values.AI_CREDENTIAL_MASTER_KEYS_JSON || "");
      } catch {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["AI_CREDENTIAL_MASTER_KEYS_JSON"],
          message: "AI_CREDENTIAL_MASTER_KEYS_JSON must be a JSON object of versioned keys."
        });
        keys = undefined;
      }
      if (
        keys !== undefined &&
        (keys === null || Array.isArray(keys) || typeof keys !== "object")
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["AI_CREDENTIAL_MASTER_KEYS_JSON"],
          message: "AI_CREDENTIAL_MASTER_KEYS_JSON must be a JSON object of versioned keys."
        });
      } else if (keys) {
        for (const [version, encoded] of Object.entries(keys)) {
          const decoded = Buffer.from(String(encoded), "base64");
          if (
            !/^[1-9]\d*$/u.test(version) ||
            typeof encoded !== "string" ||
            decoded.length !== 32 ||
            decoded.toString("base64") !== encoded
          ) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["AI_CREDENTIAL_MASTER_KEYS_JSON"],
              message: "Each credential key version must contain exactly 32 base64-encoded bytes."
            });
            break;
          }
        }
        if (!Object.hasOwn(keys, String(values.AI_CREDENTIAL_ACTIVE_KEY_VERSION))) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["AI_CREDENTIAL_ACTIVE_KEY_VERSION"],
            message: "The active credential key version must exist in the configured key ring."
          });
        }
      }
    }

    if (values.GITHUB_INTEGRATION_ENABLED === "true") {
      for (const key of [
        "GITHUB_APP_ID",
        "GITHUB_APP_SLUG",
        "GITHUB_APP_CLIENT_ID",
        "GITHUB_APP_CLIENT_SECRET",
        "GITHUB_APP_PRIVATE_KEY_BASE64",
        "GITHUB_WEBHOOK_SECRET"
      ]) {
        if (!values[key]) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when GitHub integration is enabled.`
          });
        }
      }
    }

    if (values.INVITATION_EMAIL_PROVIDER === "resend") {
      for (const key of ["INVITATION_FROM_EMAIL", "RESEND_API_KEY"]) {
        if (!values[key]) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when invitation email delivery uses Resend.`
          });
        }
      }
    }

    if (values.MFA_ENABLED === "true") {
      const key = Buffer.from(values.ACCOUNT_ENCRYPTION_KEY_BASE64 || "", "base64");
      if (key.length !== 32) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["ACCOUNT_ENCRYPTION_KEY_BASE64"],
          message:
            "ACCOUNT_ENCRYPTION_KEY_BASE64 must decode to exactly 32 bytes when MFA is enabled."
        });
      }
    }

    if (values.ACCOUNT_EMAIL_PROVIDER === "resend") {
      for (const key of ["ACCOUNT_FROM_EMAIL", "RESEND_API_KEY"]) {
        if (!values[key]) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when account email delivery uses Resend.`
          });
        }
      }
    }
  });

const loadConfig = (overrides = {}) => {
  const values = envSchema.parse({ ...process.env, ...overrides });

  const corsOrigins = values.CORS_ORIGIN.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const credentialKeys = values.AI_CREDENTIAL_MASTER_KEYS_JSON
    ? Object.fromEntries(
        Object.entries(JSON.parse(values.AI_CREDENTIAL_MASTER_KEYS_JSON)).map(
          ([version, value]) => [Number(version), Buffer.from(String(value), "base64")]
        )
      )
    : {};

  return {
    nodeEnv: values.NODE_ENV,
    port: values.PORT,
    databaseUrl: values.DATABASE_URL,
    jwtSecret: values.JWT_SECRET,
    accessTokenTtl: values.ACCESS_TOKEN_TTL,
    refreshTokenDays: values.REFRESH_TOKEN_DAYS,
    refreshCookieName: values.REFRESH_COOKIE_NAME,
    corsOrigins,
    cookieSameSite: values.COOKIE_SAME_SITE || (values.NODE_ENV === "production" ? "none" : "lax"),
    secureCookies: values.NODE_ENV === "production",
    trustProxy: values.TRUST_PROXY === "true",
    apiRateLimit: values.API_RATE_LIMIT,
    expensiveActionRateLimit: values.EXPENSIVE_ACTION_RATE_LIMIT,
    webhookRateLimit: values.WEBHOOK_RATE_LIMIT,
    aiPlannerEnabled: values.AI_PLANNER_ENABLED === "true",
    aiDailyRunsMax: values.AI_DAILY_RUNS_MAX,
    aiPromptCharactersMax: values.AI_PROMPT_CHARACTERS_MAX,
    aiOutputTokensMax: values.AI_OUTPUT_TOKENS_MAX,
    aiProposedActionsMax: values.AI_PROPOSED_ACTIONS_MAX,
    aiTimeoutMsMax: values.AI_TIMEOUT_MS_MAX,
    aiUsageRetentionDaysMax: values.AI_USAGE_RETENTION_DAYS_MAX,
    aiPlannerTimeoutMs: values.AI_PLANNER_TIMEOUT_MS,
    aiPlanApprovalTtlMinutes: values.AI_PLAN_APPROVAL_TTL_MINUTES,
    aiConversationRetentionDays: values.AI_CONVERSATION_RETENTION_DAYS,
    aiCredentialVaultEnabled: values.AI_CREDENTIAL_VAULT_ENABLED === "true",
    aiCredentialMasterKeys: credentialKeys,
    aiCredentialActiveKeyVersion: values.AI_CREDENTIAL_ACTIVE_KEY_VERSION,
    aiCredentialValidationTimeoutMs: values.AI_CREDENTIAL_VALIDATION_TIMEOUT_MS,
    mfaEnabled: values.MFA_ENABLED === "true",
    accountEncryptionKeyBase64: values.ACCOUNT_ENCRYPTION_KEY_BASE64,
    githubIntegrationEnabled: values.GITHUB_INTEGRATION_ENABLED === "true",
    githubAppId: values.GITHUB_APP_ID,
    githubAppSlug: values.GITHUB_APP_SLUG,
    githubAppClientId: values.GITHUB_APP_CLIENT_ID,
    githubAppClientSecret: values.GITHUB_APP_CLIENT_SECRET,
    githubAppPrivateKeyBase64: values.GITHUB_APP_PRIVATE_KEY_BASE64,
    githubWebhookSecret: values.GITHUB_WEBHOOK_SECRET,
    githubApiVersion: values.GITHUB_API_VERSION,
    githubConnectStateTtlMinutes: values.GITHUB_CONNECT_STATE_TTL_MINUTES,
    appBaseUrl: values.APP_BASE_URL || corsOrigins[0],
    invitationEmailProvider: values.INVITATION_EMAIL_PROVIDER,
    invitationFromEmail: values.INVITATION_FROM_EMAIL,
    invitationTtlHours: values.INVITATION_TTL_HOURS,
    accountEmailProvider: values.ACCOUNT_EMAIL_PROVIDER,
    accountFromEmail: values.ACCOUNT_FROM_EMAIL,
    emailVerificationTtlMinutes: values.EMAIL_VERIFICATION_TTL_MINUTES,
    passwordResetTtlMinutes: values.PASSWORD_RESET_TTL_MINUTES,
    resendApiKey: values.RESEND_API_KEY
  };
};

module.exports = { loadConfig };
