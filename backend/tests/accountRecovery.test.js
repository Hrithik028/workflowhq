const request = require("supertest");

const { buildTestApp } = require("./helpers/testApp");

describe("email verification and password recovery", () => {
  let app;
  let db;
  let mailer;

  beforeEach(async () => {
    mailer = {
      sendEmailVerification: globalThis.vi.fn().mockResolvedValue({ status: "sent" }),
      sendPasswordReset: globalThis.vi.fn().mockResolvedValue({ status: "sent" }),
      sendProjectInvitation: globalThis.vi.fn().mockResolvedValue({ status: "sent" })
    };
    ({ app, db } = await buildTestApp({
      config: {
        accountEmailProvider: "resend",
        accountFromEmail: "WorkflowHQ <security@example.com>"
      },
      invitationMailer: mailer
    }));
  });

  afterEach(async () => {
    await db.end();
  });

  const register = () =>
    request(app).post("/api/auth/register").send({
      name: "Recovery User",
      email: "recovery@example.com",
      password: "secure-password"
    });

  const tokenFrom = (url) => new URL(url).searchParams.get("token");

  it("requires email verification before login and consumes the link once", async () => {
    const registration = await register();
    const verificationUrl = mailer.sendEmailVerification.mock.calls[0][0].verificationUrl;
    const token = tokenFrom(verificationUrl);
    const before = await request(app).post("/api/auth/login").send({
      email: "recovery@example.com",
      password: "secure-password"
    });
    const verified = await request(app).post("/api/auth/email-verification/verify").send({ token });
    const replay = await request(app).post("/api/auth/email-verification/verify").send({ token });
    const after = await request(app).post("/api/auth/login").send({
      email: "recovery@example.com",
      password: "secure-password"
    });

    expect(registration.status).toBe(201);
    expect(registration.body.data).toMatchObject({ verificationRequired: true });
    expect(registration.body.data.accessToken).toBeUndefined();
    expect(before.body.error.code).toBe("EMAIL_VERIFICATION_REQUIRED");
    expect(verified.status).toBe(200);
    expect(replay.body.error.code).toBe("VERIFICATION_TOKEN_INVALID");
    expect(after.body.data.accessToken).toEqual(expect.any(String));
  });

  it("returns the same verification response for unknown and known emails", async () => {
    await register();
    const known = await request(app)
      .post("/api/auth/email-verification/request")
      .send({ email: "recovery@example.com" });
    const unknown = await request(app)
      .post("/api/auth/email-verification/request")
      .send({ email: "missing@example.com" });

    expect(known.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect(known.body).toEqual(unknown.body);
  });

  it("resets the password, consumes the token, and revokes every session", async () => {
    await register();
    const verificationToken = tokenFrom(
      mailer.sendEmailVerification.mock.calls[0][0].verificationUrl
    );
    await request(app)
      .post("/api/auth/email-verification/verify")
      .send({ token: verificationToken });
    await request(app).post("/api/auth/login").send({
      email: "recovery@example.com",
      password: "secure-password"
    });

    const requested = await request(app)
      .post("/api/auth/password-reset/request")
      .send({ email: "recovery@example.com" });
    const resetToken = tokenFrom(mailer.sendPasswordReset.mock.calls[0][0].resetUrl);
    const reset = await request(app)
      .post("/api/auth/password-reset/confirm")
      .send({ token: resetToken, password: "new-secure-password" });
    const replay = await request(app)
      .post("/api/auth/password-reset/confirm")
      .send({ token: resetToken, password: "another-password" });
    const oldLogin = await request(app).post("/api/auth/login").send({
      email: "recovery@example.com",
      password: "secure-password"
    });
    const newLogin = await request(app).post("/api/auth/login").send({
      email: "recovery@example.com",
      password: "new-secure-password"
    });

    expect(requested.status).toBe(202);
    expect(reset.status).toBe(200);
    expect(replay.body.error.code).toBe("PASSWORD_RESET_TOKEN_INVALID");
    expect(oldLogin.body.error.code).toBe("INVALID_CREDENTIALS");
    expect(newLogin.status).toBe(200);
    expect((await db.query("SELECT * FROM refresh_sessions")).rows).toHaveLength(1);
  });
});
