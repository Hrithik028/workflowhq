const { loadConfig } = require("../src/config/env");

const required = {
  NODE_ENV: "test",
  DATABASE_URL: "postgres://workflowhq:test@localhost:5432/workflowhq_test",
  JWT_SECRET: "test-secret-that-is-at-least-thirty-two-characters",
  GITHUB_INTEGRATION_ENABLED: "false"
};

describe("invitation configuration", () => {
  it("uses the first allowed frontend origin for invitation links", () => {
    const config = loadConfig({
      ...required,
      CORS_ORIGIN: "https://app.workflowhq.example,https://preview.workflowhq.example"
    });

    expect(config.appBaseUrl).toBe("https://app.workflowhq.example");
    expect(config.invitationEmailProvider).toBe("disabled");
    expect(config.invitationTtlHours).toBe(168);
    expect(config.aiPlanApprovalTtlMinutes).toBe(15);
  });

  it("requires server-side Resend credentials when email delivery is enabled", () => {
    expect(() =>
      loadConfig({
        ...required,
        INVITATION_EMAIL_PROVIDER: "resend",
        INVITATION_FROM_EMAIL: undefined,
        RESEND_API_KEY: undefined
      })
    ).toThrow(/INVITATION_FROM_EMAIL is required/);
  });

  it("accepts an explicit public frontend URL and complete Resend configuration", () => {
    const config = loadConfig({
      ...required,
      APP_BASE_URL: "https://workflowhq.example",
      INVITATION_EMAIL_PROVIDER: "resend",
      INVITATION_FROM_EMAIL: "WorkflowHQ <invites@workflowhq.example>",
      INVITATION_TTL_HOURS: "72",
      RESEND_API_KEY: "re_test_server_only"
    });

    expect(config.appBaseUrl).toBe("https://workflowhq.example");
    expect(config.invitationFromEmail).toContain("invites@workflowhq.example");
    expect(config.invitationTtlHours).toBe(72);
  });
});

describe("AI credential vault configuration", () => {
  const encodedKey = Buffer.alloc(32, 4).toString("base64");

  it("loads a versioned 32-byte key ring", () => {
    const config = loadConfig({
      ...required,
      AI_CREDENTIAL_VAULT_ENABLED: "true",
      AI_CREDENTIAL_MASTER_KEYS_JSON: JSON.stringify({ 1: encodedKey }),
      AI_CREDENTIAL_ACTIVE_KEY_VERSION: "1"
    });

    expect(config.aiCredentialVaultEnabled).toBe(true);
    expect(config.aiCredentialMasterKeys[1]).toEqual(Buffer.alloc(32, 4));
    expect(config.aiCredentialActiveKeyVersion).toBe(1);
  });

  it("fails closed when planning is enabled without the credential vault", () => {
    expect(() =>
      loadConfig({
        ...required,
        AI_PLANNER_ENABLED: "true",
        AI_CREDENTIAL_VAULT_ENABLED: "false"
      })
    ).toThrow(/AI_CREDENTIAL_VAULT_ENABLED must be true/);
  });

  it("rejects malformed and incomplete key rings", () => {
    expect(() =>
      loadConfig({
        ...required,
        AI_CREDENTIAL_VAULT_ENABLED: "true",
        AI_CREDENTIAL_MASTER_KEYS_JSON: JSON.stringify({ 1: "not-32-bytes" }),
        AI_CREDENTIAL_ACTIVE_KEY_VERSION: "1"
      })
    ).toThrow(/exactly 32 base64-encoded bytes/);

    expect(() =>
      loadConfig({
        ...required,
        AI_CREDENTIAL_VAULT_ENABLED: "true",
        AI_CREDENTIAL_MASTER_KEYS_JSON: JSON.stringify({ 1: encodedKey }),
        AI_CREDENTIAL_ACTIVE_KEY_VERSION: "2"
      })
    ).toThrow(/active credential key version must exist/);
  });
});
