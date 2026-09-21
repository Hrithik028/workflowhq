const request = require("supertest");

const { generateTotp } = require("../src/lib/mfa");
const { issueAccountToken } = require("../src/lib/accountTokens");
const { auth, buildTestApp, registerUser } = require("./helpers/testApp");

const encryptionKey = Buffer.alloc(32, 7).toString("base64");

describe("multi-factor authentication", () => {
  let app;
  let db;

  beforeEach(async () => {
    ({ app, db } = await buildTestApp({
      config: { mfaEnabled: true, accountEncryptionKeyBase64: encryptionKey }
    }));
  });

  afterEach(async () => {
    await db.end();
  });

  const enableFor = async (registered) => {
    const setup = await request(app)
      .post("/api/auth/mfa/setup")
      .set(auth(registered.token))
      .send({ password: "secure-password" });
    const secret = setup.body.data.secret;
    const enabled = await request(app)
      .post("/api/auth/mfa/enable")
      .set(auth(registered.token))
      .send({ code: generateTotp(secret) });
    return { enabled, secret };
  };

  it("encrypts the TOTP secret and returns recovery codes only when MFA is enabled", async () => {
    const registered = await registerUser(app, "mfa-setup");
    const { enabled, secret } = await enableFor(registered);
    const stored = await db.query(
      "SELECT mfa_enabled, mfa_secret_encrypted FROM users WHERE id = $1",
      [registered.user.id]
    );

    expect(enabled.status).toBe(200);
    expect(enabled.body.data.recoveryCodes).toHaveLength(10);
    expect(stored.rows[0].mfa_enabled).toBe(true);
    expect(stored.rows[0].mfa_secret_encrypted).not.toContain(secret);
  });

  it("allows normal sign-in after MFA is enabled", async () => {
    const registered = await registerUser(app, "mfa-login");
    await enableFor(registered);

    const login = await request(app).post("/api/auth/login").send({
      email: registered.user.email,
      password: "secure-password"
    });

    expect(login.status).toBe(200);
    expect(login.body.data.accessToken).toEqual(expect.any(String));
  });

  it("requires a second factor when an MFA-enabled user resets their password", async () => {
    const registered = await registerUser(app, "mfa-reset");
    const { secret } = await enableFor(registered);
    const resetToken = await issueAccountToken(db, {
      userId: registered.user.id,
      purpose: "password_reset",
      ttlMinutes: 30
    });
    const missingCode = await request(app).post("/api/auth/password-reset/confirm").send({
      token: resetToken,
      password: "new-secure-password"
    });
    const reset = await request(app).post("/api/auth/password-reset/confirm").send({
      token: resetToken,
      password: "new-secure-password",
      code: generateTotp(secret, Date.now() + 30_000)
    });

    expect(missingCode.status).toBe(401);
    expect(missingCode.body.error.code).toBe("MFA_CODE_REQUIRED");
    expect(reset.status).toBe(200);
  });

  it("requires the current password and a second factor before disabling MFA", async () => {
    const registered = await registerUser(app, "mfa-disable");
    const { secret } = await enableFor(registered);

    const invalid = await request(app)
      .post("/api/auth/mfa/disable")
      .set(auth(registered.token))
      .send({ password: "wrong-password", code: generateTotp(secret, Date.now() + 30_000) });
    const disabled = await request(app)
      .post("/api/auth/mfa/disable")
      .set(auth(registered.token))
      .send({ password: "secure-password", code: generateTotp(secret, Date.now() + 30_000) });

    expect(invalid.status).toBe(401);
    expect(disabled.status).toBe(204);
  });
});
