const bcrypt = require("bcrypt");

const { hashAccountToken, issueAccountToken } = require("../lib/accountTokens");
const { AppError } = require("../lib/errors");
const { verifySecondFactor } = require("./mfaController");

const requireAccountEmail = (req) => {
  if (req.app.locals.config.accountEmailProvider !== "resend") {
    throw new AppError(
      503,
      "ACCOUNT_EMAIL_NOT_CONFIGURED",
      "Account email delivery is not configured."
    );
  }
};

const requestEmailVerification = async (req, res) => {
  requireAccountEmail(req);
  const db = req.app.locals.db;
  const result = await db.query("SELECT id, email, email_verified_at FROM users WHERE email = $1", [
    req.body.email
  ]);
  const user = result.rows[0];
  if (user && !user.email_verified_at) {
    const token = await issueAccountToken(db, {
      userId: user.id,
      purpose: "email_verification",
      ttlMinutes: req.app.locals.config.emailVerificationTtlMinutes
    });
    try {
      await req.app.locals.invitationMailer.sendEmailVerification({
        email: user.email,
        verificationUrl: `${req.app.locals.config.appBaseUrl}/verify-email?token=${encodeURIComponent(token)}`
      });
    } catch {
      // Keep the response indistinguishable to avoid account enumeration.
    }
  }
  return res.status(202).json({
    data: { message: "If that account requires verification, a new email has been sent." }
  });
};

const verifyEmail = async (req, res, next) => {
  const client = await req.app.locals.db.connect();
  try {
    await client.query("BEGIN");
    const token = await client.query(
      `UPDATE account_tokens
       SET used_at = CURRENT_TIMESTAMP
       WHERE token_hash = $1 AND purpose = 'email_verification'
         AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP
       RETURNING user_id`,
      [hashAccountToken(req.body.token)]
    );
    if (token.rows.length === 0) {
      await client.query("ROLLBACK");
      return next(
        new AppError(
          400,
          "VERIFICATION_TOKEN_INVALID",
          "The verification link is invalid or expired."
        )
      );
    }
    await client.query(
      "UPDATE users SET email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP) WHERE id = $1",
      [token.rows[0].user_id]
    );
    await client.query("COMMIT");
    return res.status(200).json({ data: { verified: true } });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const requestPasswordReset = async (req, res) => {
  requireAccountEmail(req);
  const db = req.app.locals.db;
  const result = await db.query("SELECT id, email FROM users WHERE email = $1", [req.body.email]);
  const user = result.rows[0];
  if (user) {
    const token = await issueAccountToken(db, {
      userId: user.id,
      purpose: "password_reset",
      ttlMinutes: req.app.locals.config.passwordResetTtlMinutes
    });
    try {
      await req.app.locals.invitationMailer.sendPasswordReset({
        email: user.email,
        resetUrl: `${req.app.locals.config.appBaseUrl}/reset-password?token=${encodeURIComponent(token)}`
      });
    } catch {
      // Keep the response indistinguishable to avoid account enumeration.
    }
  }
  return res.status(202).json({
    data: { message: "If an account exists for that email, a password reset link has been sent." }
  });
};

const resetPassword = async (req, res, next) => {
  const client = await req.app.locals.db.connect();
  try {
    await client.query("BEGIN");
    const token = await client.query(
      `SELECT users.id, account_tokens.user_id, users.mfa_enabled, users.mfa_secret_encrypted,
              users.mfa_last_used_step
       FROM account_tokens
       JOIN users ON users.id = account_tokens.user_id
       WHERE account_tokens.token_hash = $1
         AND account_tokens.purpose = 'password_reset'
         AND account_tokens.used_at IS NULL
         AND account_tokens.expires_at > CURRENT_TIMESTAMP
       FOR UPDATE`,
      [hashAccountToken(req.body.token)]
    );
    if (token.rows.length === 0) {
      await client.query("ROLLBACK");
      return next(
        new AppError(400, "PASSWORD_RESET_TOKEN_INVALID", "The reset link is invalid or expired.")
      );
    }
    const resetUser = token.rows[0];
    if (resetUser.mfa_enabled) {
      if (!req.app.locals.config.mfaEnabled) {
        throw new AppError(
          503,
          "MFA_UNAVAILABLE",
          "Authenticator verification is temporarily unavailable."
        );
      }
      if (!req.body.code) {
        throw new AppError(
          401,
          "MFA_CODE_REQUIRED",
          "Enter an authenticator or recovery code to reset this password."
        );
      }
      await verifySecondFactor(client, resetUser, req.body.code, req.app.locals.config);
    }

    const passwordHash = await bcrypt.hash(req.body.password, 12);
    await client.query(
      `UPDATE users
       SET password_hash = $1, auth_version = auth_version + 1
       WHERE id = $2`,
      [passwordHash, token.rows[0].user_id]
    );
    await client.query(
      "UPDATE account_tokens SET used_at = CURRENT_TIMESTAMP WHERE token_hash = $1",
      [hashAccountToken(req.body.token)]
    );
    await client.query("DELETE FROM refresh_sessions WHERE user_id = $1", [token.rows[0].user_id]);
    await client.query(
      "UPDATE account_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND used_at IS NULL",
      [token.rows[0].user_id]
    );
    await client.query("COMMIT");
    return res.status(200).json({ data: { passwordReset: true } });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

module.exports = { requestEmailVerification, requestPasswordReset, resetPassword, verifyEmail };
