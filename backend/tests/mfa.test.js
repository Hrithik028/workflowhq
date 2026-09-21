const request = require("supertest");

const { generateTotp } = require("../src/lib/mfa");
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

  it("requires a second factor after a correct password", async () => {
    const registered = await registerUser(app, "mfa-login");
    const { secret } = await enableFor(registered);

    const login = await request(app).post("/api/auth/login").send({
      email: registered.user.email,
      password: "secure-password"
    });
    const verified = await request(app)
      .post("/api/auth/mfa/verify")
      .send({
        challengeToken: login.body.data.challengeToken,
        code: generateTotp(secret, Date.now() + 30_000)
      });

    expect(login.body.data).toMatchObject({ mfaRequired: true });
    expect(login.body.data.accessToken).toBeUndefined();
    expect(verified.status).toBe(200);
    expect(verified.body.data.accessToken).toEqual(expect.any(String));
  });

  it("consumes a recovery code only once", async () => {
    const registered = await registerUser(app, "mfa-recovery");
    const { enabled } = await enableFor(registered);
    const recoveryCode = enabled.body.data.recoveryCodes[0];
    const login = await request(app).post("/api/auth/login").send({
      email: registered.user.email,
      password: "secure-password"
    });

    const first = await request(app).post("/api/auth/mfa/verify").send({
      challengeToken: login.body.data.challengeToken,
      code: recoveryCode
    });
    const secondLogin = await request(app).post("/api/auth/login").send({
      email: registered.user.email,
      password: "secure-password"
    });
    const replay = await request(app).post("/api/auth/mfa/verify").send({
      challengeToken: secondLogin.body.data.challengeToken,
      code: recoveryCode
    });

    expect(first.status).toBe(200);
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe("MFA_CODE_INVALID");
  });

  it("rejects replay of a TOTP value even with a new password challenge", async () => {
    const registered = await registerUser(app, "mfa-replay");
    const { secret } = await enableFor(registered);
    const code = generateTotp(secret, Date.now() + 30_000);
    const firstLogin = await request(app).post("/api/auth/login").send({
      email: registered.user.email,
      password: "secure-password"
    });
    const first = await request(app).post("/api/auth/mfa/verify").send({
      challengeToken: firstLogin.body.data.challengeToken,
      code
    });
    const secondLogin = await request(app).post("/api/auth/login").send({
      email: registered.user.email,
      password: "secure-password"
    });
    const replay = await request(app).post("/api/auth/mfa/verify").send({
      challengeToken: secondLogin.body.data.challengeToken,
      code
    });

    expect(first.status).toBe(200);
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe("MFA_CODE_REPLAYED");
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
