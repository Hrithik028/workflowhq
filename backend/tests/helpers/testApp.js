const fs = require("node:fs");
const path = require("node:path");

const { newDb } = require("pg-mem");
const request = require("supertest");

const { createApp } = require("../../src/app");

const testConfig = {
  nodeEnv: "test",
  port: 0,
  databaseUrl: "test",
  jwtSecret: "test-secret-that-is-longer-than-thirty-two-characters",
  accessTokenTtl: "15m",
  refreshTokenDays: 7,
  refreshCookieName: "workflowhq_refresh",
  corsOrigins: ["http://localhost:5173"],
  cookieSameSite: "lax",
  secureCookies: false,
  trustProxy: false,
  apiRateLimit: 600,
  expensiveActionRateLimit: 20,
  webhookRateLimit: 600,
  aiPlannerEnabled: false,
  aiDailyRunsMax: 100,
  aiPromptCharactersMax: 50000,
  aiOutputTokensMax: 10000,
  aiProposedActionsMax: 50,
  aiTimeoutMsMax: 60000,
  aiUsageRetentionDaysMax: 90,
  aiPlannerTimeoutMs: 30000,
  aiPlanApprovalTtlMinutes: 15,
  aiConversationRetentionDays: 15,
  aiCredentialVaultEnabled: false,
  aiCredentialMasterKeys: {},
  aiCredentialActiveKeyVersion: 1,
  aiCredentialValidationTimeoutMs: 10000,
  mfaEnabled: false,
  accountEncryptionKeyBase64: undefined,
  appBaseUrl: "http://localhost:5173",
  invitationEmailProvider: "disabled",
  invitationFromEmail: undefined,
  invitationTtlHours: 168,
  accountEmailProvider: "disabled",
  accountFromEmail: undefined,
  emailVerificationTtlMinutes: 1440,
  passwordResetTtlMinutes: 30,
  resendApiKey: undefined
};

const buildTestApp = async ({
  config = {},
  github,
  invitationMailer,
  aiPlanner,
  aiCredentialValidator
} = {}) => {
  const memoryDb = newDb({ autoCreateForeignKeyIndices: true });
  const adapter = memoryDb.adapters.createPg();
  const db = new adapter.Pool();
  const migrationsDirectory = path.resolve(__dirname, "../../migrations");
  const migrationFiles = fs
    .readdirSync(migrationsDirectory)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of migrationFiles) {
    // PostgreSQL safely replays this historical compatibility migration. pg-mem
    // cannot plan CREATE TABLE IF NOT EXISTS for an already-present table.
    // Skip only the exact duplicate, never an altered/new migration body.
    if (file === "034_notifications.sql" && migrationFiles.includes("031_notifications.sql")) {
      const normalize = (name) =>
        fs.readFileSync(path.join(migrationsDirectory, name), "utf8").replaceAll("\r\n", "\n").trim();
      if (normalize(file) !== normalize("031_notifications.sql")) {
        throw new Error("Notification compatibility migration differs from its historical schema");
      }
      continue;
    }
    let sql = fs
      .readFileSync(path.join(migrationsDirectory, file), "utf8")
      .replaceAll("TIMESTAMPTZ", "TIMESTAMP");
    if (file === "031_project_custom_workflows.sql") {
      sql = sql
        .replace(
          "status VARCHAR(30) NOT NULL CHECK",
          "status VARCHAR(30) NOT NULL CONSTRAINT project_status_labels_status_check CHECK"
        )
        .replace(
          "from_status VARCHAR(30) NOT NULL CHECK",
          "from_status VARCHAR(30) NOT NULL CONSTRAINT project_status_transitions_from_status_check CHECK"
        )
        .replace(
          "to_status VARCHAR(30) NOT NULL CHECK",
          "to_status VARCHAR(30) NOT NULL CONSTRAINT project_status_transitions_to_status_check CHECK"
        );
    }
    // pg-mem gives anonymous constraints different names from PostgreSQL.
    // Supply PostgreSQL's names so additive migrations can replace them.
    if (file === "026_ai_provider_credentials.sql") {
      sql = sql
        .replace(
          "UNIQUE (user_id, provider)",
          "CONSTRAINT ai_provider_credentials_user_id_provider_key UNIQUE (user_id, provider)"
        )
        .replace(
          "CHECK (encryption_version = 1)",
          "CONSTRAINT ai_provider_credentials_encryption_version_check CHECK (encryption_version = 1)"
        );
    }
    await db.query(sql);
  }

  // Test-only allowlists keep mock models subject to the same mandatory boundary.
  await db.query("UPDATE ai_governance_settings SET provider_policies = $1::jsonb", [
    JSON.stringify(
      ["openai", "anthropic", "google"].map((provider) => ({
        provider,
        enabled: true,
        allowedModels: ["test-model"],
        defaultModel: "test-model"
      }))
    )
  ]);

  return {
    app: createApp({
      db,
      config: { ...testConfig, ...config },
      github,
      invitationMailer,
      aiPlanner,
      aiCredentialValidator
    }),
    db
  };
};

const registerUser = async (app, suffix = "one") => {
  const response = await request(app)
    .post("/api/auth/register")
    .send({
      name: `Test User ${suffix}`,
      email: `${suffix}@example.com`,
      password: "secure-password"
    });

  return {
    response,
    token: response.body.data?.accessToken,
    user: response.body.data?.user
  };
};

const auth = (token) => ({ Authorization: `Bearer ${token}` });

module.exports = { auth, buildTestApp, registerUser, testConfig };
