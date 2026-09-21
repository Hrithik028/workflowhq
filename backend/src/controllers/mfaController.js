const { createHash } = require("node:crypto");

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const { createRefreshSession, sendSession } = require("./authController");
const { AppError } = require("../lib/errors");
const {
  createOtpAuthUri,
  decryptSecret,
  encryptSecret,
  generateMfaSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
  matchTotpStep
} = require("../lib/mfa");

const requireMfaFeature = (req) => {
  if (!req.app.locals.config.mfaEnabled) {
    throw new AppError(503, "MFA_NOT_CONFIGURED", "Multi-factor authentication is not configured.");
  }
};

const loadUser = async (db, userId) => {
  const result = await db.query(
    `SELECT id, name, email, role, auth_version, password_hash, mfa_enabled,
            mfa_secret_encrypted, mfa_enabled_at, email_verified_at, created_at
     FROM users WHERE id = $1`,
    [userId]
  );
  if (!result.rows[0]) throw new AppError(404, "USER_NOT_FOUND", "User not found.");
  return result.rows[0];
};

const verifySecondFactor = async (db, user, code, config) => {
  const secret = decryptSecret(user.mfa_secret_encrypted, config);
  const step = matchTotpStep(secret, code);
  if (step !== null) {
    const consumed = await db.query(
      `UPDATE users
       SET mfa_last_used_step = $1
       WHERE id = $2 AND (mfa_last_used_step IS NULL OR mfa_last_used_step < $1)
       RETURNING id`,
      [step, user.id]
    );
    if (consumed.rows.length > 0) return "totp";
    throw new AppError(401, "MFA_CODE_REPLAYED", "This authentication code was already used.");
  }

  const recovery = await db.query(
    `UPDATE mfa_recovery_codes
     SET used_at = CURRENT_TIMESTAMP
     WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL
     RETURNING id`,
    [user.id, hashRecoveryCode(code)]
  );
  if (recovery.rows.length > 0) return "recovery";
  throw new AppError(401, "MFA_CODE_INVALID", "The authentication code is invalid or expired.");
};

const getMfaStatus = async (req, res) => {
  requireMfaFeature(req);
  const user = await loadUser(req.app.locals.db, req.user.id);
  const recovery = user.mfa_enabled
    ? await req.app.locals.db.query(
        "SELECT COUNT(*)::int AS count FROM mfa_recovery_codes WHERE user_id = $1 AND used_at IS NULL",
        [user.id]
      )
    : { rows: [{ count: 0 }] };
  return res.status(200).json({
    data: {
      enabled: user.mfa_enabled,
      enabledAt: user.mfa_enabled_at,
      recoveryCodesRemaining: Number(recovery.rows[0].count)
    }
  });
};

const startMfaSetup = async (req, res, next) => {
  requireMfaFeature(req);
  const db = req.app.locals.db;
  const user = await loadUser(db, req.user.id);
  if (user.mfa_enabled) {
    return next(new AppError(409, "MFA_ALREADY_ENABLED", "MFA is already enabled."));
  }
  if (!(await bcrypt.compare(req.body.password, user.password_hash))) {
    return next(new AppError(401, "PASSWORD_INVALID", "The current password is incorrect."));
  }

  const secret = generateMfaSecret();
  await db.query("UPDATE users SET mfa_secret_encrypted = $1 WHERE id = $2", [
    encryptSecret(secret, req.app.locals.config),
    user.id
  ]);
  return res.status(200).json({
    data: {
      secret,
      otpAuthUri: createOtpAuthUri({ secret, email: user.email })
    }
  });
};

const enableMfa = async (req, res, next) => {
  requireMfaFeature(req);
  const db = req.app.locals.db;
  const user = await loadUser(db, req.user.id);
  if (user.mfa_enabled) {
    return next(new AppError(409, "MFA_ALREADY_ENABLED", "MFA is already enabled."));
  }
  if (!user.mfa_secret_encrypted) {
    return next(new AppError(409, "MFA_SETUP_REQUIRED", "Start MFA setup before enabling it."));
  }
  const secret = decryptSecret(user.mfa_secret_encrypted, req.app.locals.config);
  const step = matchTotpStep(secret, req.body.code);
  if (step === null) {
    return next(new AppError(401, "MFA_CODE_INVALID", "The authentication code is invalid."));
  }

  const recoveryCodes = generateRecoveryCodes();
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM mfa_recovery_codes WHERE user_id = $1", [user.id]);
    for (const code of recoveryCodes) {
      await client.query("INSERT INTO mfa_recovery_codes (user_id, code_hash) VALUES ($1, $2)", [
        user.id,
        hashRecoveryCode(code)
      ]);
    }
    await client.query(
      `UPDATE users
       SET mfa_enabled = TRUE, mfa_enabled_at = CURRENT_TIMESTAMP, mfa_last_used_step = $2
       WHERE id = $1`,
      [user.id, step]
    );
    await client.query("DELETE FROM refresh_sessions WHERE user_id = $1 AND id <> $2", [
      user.id,
      req.user.sessionId
    ]);
    await client.query("COMMIT");
    return res.status(200).json({ data: { recoveryCodes } });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const disableMfa = async (req, res, next) => {
  requireMfaFeature(req);
  const db = req.app.locals.db;
  const user = await loadUser(db, req.user.id);
  if (!user.mfa_enabled) {
    return next(new AppError(409, "MFA_NOT_ENABLED", "MFA is not enabled."));
  }
  if (!(await bcrypt.compare(req.body.password, user.password_hash))) {
    return next(new AppError(401, "PASSWORD_INVALID", "The current password is incorrect."));
  }
  await verifySecondFactor(db, user, req.body.code, req.app.locals.config);

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE users
       SET mfa_enabled = FALSE, mfa_secret_encrypted = NULL,
           mfa_last_used_step = NULL, mfa_enabled_at = NULL
       WHERE id = $1`,
      [user.id]
    );
    await client.query("DELETE FROM mfa_recovery_codes WHERE user_id = $1", [user.id]);
    await client.query("DELETE FROM refresh_sessions WHERE user_id = $1 AND id <> $2", [
      user.id,
      req.user.sessionId
    ]);
    await client.query("COMMIT");
    return res.status(204).send();
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const verifyMfaLogin = async (req, res, next) => {
  requireMfaFeature(req);
  let challenge;
  try {
    challenge = jwt.verify(req.body.challengeToken, req.app.locals.config.jwtSecret);
    if (challenge.type !== "mfa_challenge") throw new Error("Unexpected challenge type.");
  } catch {
    return next(new AppError(401, "MFA_CHALLENGE_INVALID", "The MFA challenge has expired."));
  }

  const client = await req.app.locals.db.connect();
  try {
    await client.query("BEGIN");
    const challengeResult = await client.query(
      `DELETE FROM mfa_login_challenges
       WHERE token_hash = $1 AND user_id = $2 AND expires_at > CURRENT_TIMESTAMP
       RETURNING user_id`,
      [
        createHash("sha256")
          .update(challenge.nonce || "")
          .digest("hex"),
        Number(challenge.sub)
      ]
    );
    if (challengeResult.rows.length === 0) {
      throw new AppError(401, "MFA_CHALLENGE_INVALID", "The MFA challenge is no longer valid.");
    }

    const user = await loadUser(client, Number(challenge.sub));
    if (
      !user.mfa_enabled ||
      Number(user.auth_version) !== Number(challenge.authVersion) ||
      !user.mfa_secret_encrypted
    ) {
      throw new AppError(401, "MFA_CHALLENGE_INVALID", "The MFA challenge is no longer valid.");
    }
    await verifySecondFactor(client, user, req.body.code, req.app.locals.config);
    const refreshSession = await createRefreshSession(client, user.id, req);
    await client.query("COMMIT");
    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      auth_version: user.auth_version,
      email_verified_at: user.email_verified_at,
      created_at: user.created_at
    };
    return sendSession(res, req, 200, safeUser, refreshSession);
  } catch (error) {
    await client.query("ROLLBACK");
    return next(error);
  } finally {
    client.release();
  }
};

module.exports = { disableMfa, enableMfa, getMfaStatus, startMfaSetup, verifyMfaLogin };
