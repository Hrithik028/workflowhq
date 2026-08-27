const { resolveDemoUser } = require("../src/db/seedDemo");

describe("demo seed safeguards", () => {
  it("keeps convenient defaults for local development", () => {
    expect(resolveDemoUser({ NODE_ENV: "development" })).toMatchObject({
      email: "demo@workflowhq.app",
      password: "WorkflowHQ!2026"
    });
  });

  it("refuses to seed production without explicit approval", () => {
    expect(() => resolveDemoUser({ NODE_ENV: "production" })).toThrow(
      "Demo seeding is disabled in production"
    );
  });

  it("requires explicit credentials when production seeding is approved", () => {
    expect(() => resolveDemoUser({ NODE_ENV: "production", ALLOW_DEMO_SEED: "true" })).toThrow(
      "Production demo seeding requires explicit"
    );

    expect(
      resolveDemoUser({
        NODE_ENV: "production",
        ALLOW_DEMO_SEED: "true",
        DEMO_USER_NAME: "Release Demo",
        DEMO_USER_EMAIL: "release@example.com",
        DEMO_USER_PASSWORD: "an-explicit-production-password"
      })
    ).toMatchObject({
      name: "Release Demo",
      email: "release@example.com"
    });
  });
});
