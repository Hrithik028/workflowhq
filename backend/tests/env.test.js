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
