const { createHash, randomBytes } = require("node:crypto");

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const { AppError } = require("../lib/errors");
const { issueAccountToken } = require("../lib/accountTokens");

const hashRefreshToken = (token) => createHash("sha256").update(token).digest("hex");

const readCookie = (req, name) => {
  const cookieHeader = req.get("cookie");
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
};

const createAccessToken = (user, config, sessionId) =>
  jwt.sign(
    {
      email: user.email,
      role: user.role,
      authVersion: Number(user.auth_version || 0),
      sessionId: Number(sessionId),
      type: "access"
    },
    config.jwtSecret,
    { subject: String(user.id), expiresIn: config.accessTokenTtl }
  );

const refreshCookieOptions = (config) => ({
  httpOnly: true,
  secure: config.secureCookies,
  sameSite: config.cookieSameSite,
  path: "/api/auth",
  maxAge: config.refreshTokenDays * 24 * 60 * 60 * 1000
});

const clearRefreshCookie = (res, config) => {
  const options = refreshCookieOptions(config);
  delete options.maxAge;
  res.clearCookie(config.refreshCookieName, options);
};

const createRefreshSession = async (db, userId, req, sessionId = null) => {
  const config = req.app.locals.config;
  const token = randomBytes(48).toString("base64url");
  const expiresAt = new Date(Date.now() + config.refreshTokenDays * 24 * 60 * 60 * 1000);

  const values = [
    userId,
    hashRefreshToken(token),
    req.get("user-agent")?.slice(0, 500) || null,
    req.ip?.slice(0, 45) || null,
    expiresAt
  ];
  const result = sessionId
    ? await db.query(
        `INSERT INTO refresh_sessions
           (id, user_id, token_hash, user_agent, ip_address, expires_at, last_used_at)
         VALUES ($6, $1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
         RETURNING id`,
        [...values, sessionId]
      )
    : await db.query(
        `INSERT INTO refresh_sessions
           (user_id, token_hash, user_agent, ip_address, expires_at, last_used_at)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
         RETURNING id`,
        values
      );

  return { token, sessionId: Number(result.rows[0].id) };
};

const sendSession = (res, req, status, user, refreshSession) => {
  const config = req.app.locals.config;
  res.cookie(config.refreshCookieName, refreshSession.token, refreshCookieOptions(config));
  return res.status(status).json({
    data: {
      accessToken: createAccessToken(user, config, refreshSession.sessionId),
      user
    }
  });
};

const register = async (req, res, next) => {
  const db = req.app.locals.db;
  const client = await db.connect();

  try {
    await client.query("BEGIN");
    const passwordHash = await bcrypt.hash(req.body.password, 12);
    const requiresVerification = req.app.locals.config.accountEmailProvider === "resend";
    const result = await client.query(
      `INSERT INTO users (name, email, password_hash, email_verified_at)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role, auth_version, email_verified_at, created_at`,
      [req.body.name, req.body.email, passwordHash, requiresVerification ? null : new Date()]
    );
    const user = result.rows[0];
    const verificationToken = requiresVerification
      ? await issueAccountToken(client, {
          userId: user.id,
          purpose: "email_verification",
          ttlMinutes: req.app.locals.config.emailVerificationTtlMinutes
        })
      : null;
    const refreshSession = requiresVerification
      ? null
      : await createRefreshSession(client, user.id, req);
    await client.query("COMMIT");
    if (requiresVerification) {
      let delivery = "sent";
      try {
        await req.app.locals.invitationMailer.sendEmailVerification({
          email: user.email,
          verificationUrl: `${req.app.locals.config.appBaseUrl}/verify-email?token=${encodeURIComponent(verificationToken)}`
        });
      } catch {
        delivery = "failed";
      }
      return res.status(201).json({ data: { verificationRequired: true, delivery } });
    }
    return sendSession(res, req, 201, user, refreshSession);
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") {
      return next(
        new AppError(409, "EMAIL_ALREADY_EXISTS", "An account with this email already exists.")
      );
    }
    return next(error);
  } finally {
    client.release();
  }
};

const login = async (req, res, next) => {
  const db = req.app.locals.db;
  const result = await db.query("SELECT * FROM users WHERE email = $1", [req.body.email]);
  const user = result.rows[0];
  const passwordMatches = user
    ? await bcrypt.compare(req.body.password, user.password_hash)
    : false;

  if (!user || !passwordMatches) {
    return next(new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password."));
  }
  if (!user.email_verified_at) {
    return next(
      new AppError(403, "EMAIL_VERIFICATION_REQUIRED", "Verify your email before signing in.")
    );
  }

  const safeUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    auth_version: user.auth_version,
    email_verified_at: user.email_verified_at,
    created_at: user.created_at
  };
  const refreshSession = await createRefreshSession(db, user.id, req);
  return sendSession(res, req, 200, safeUser, refreshSession);
};

const refresh = async (req, res, next) => {
  const config = req.app.locals.config;
  const token = readCookie(req, config.refreshCookieName);
  if (!token) {
    return next(new AppError(401, "REFRESH_REQUIRED", "A valid session is required."));
  }

  const db = req.app.locals.db;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const sessionResult = await client.query(
      `DELETE FROM refresh_sessions
       WHERE token_hash = $1 AND expires_at > CURRENT_TIMESTAMP
       RETURNING id, user_id`,
      [hashRefreshToken(token)]
    );

    if (sessionResult.rows.length === 0) {
      await client.query("ROLLBACK");
      clearRefreshCookie(res, config);
      return next(new AppError(401, "REFRESH_INVALID", "Your session is no longer valid."));
    }

    const userResult = await client.query(
      `SELECT id, name, email, role, auth_version, email_verified_at, created_at
       FROM users WHERE id = $1`,
      [sessionResult.rows[0].user_id]
    );
    if (userResult.rows.length === 0) {
      await client.query("ROLLBACK");
      clearRefreshCookie(res, config);
      return next(new AppError(401, "REFRESH_INVALID", "Your session is no longer valid."));
    }

    const user = userResult.rows[0];
    const nextRefreshSession = await createRefreshSession(
      client,
      user.id,
      req,
      sessionResult.rows[0].id
    );
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
    return sendSession(res, req, 200, safeUser, nextRefreshSession);
  } catch (error) {
    await client.query("ROLLBACK");
    return next(error);
  } finally {
    client.release();
  }
};

const logout = async (req, res) => {
  const config = req.app.locals.config;
  const token = readCookie(req, config.refreshCookieName);
  if (token) {
    await req.app.locals.db.query("DELETE FROM refresh_sessions WHERE token_hash = $1", [
      hashRefreshToken(token)
    ]);
  }
  clearRefreshCookie(res, config);
  return res.status(204).send();
};

const getCurrentUser = async (req, res, next) => {
  const result = await req.app.locals.db.query(
    `SELECT id, name, email, role, auth_version, email_verified_at, created_at
     FROM users WHERE id = $1`,
    [req.user.id]
  );
  if (result.rows.length === 0) {
    return next(new AppError(404, "USER_NOT_FOUND", "User not found."));
  }
  return res.status(200).json({ data: result.rows[0] });
};

const listSessions = async (req, res) => {
  const result = await req.app.locals.db.query(
    `SELECT id, user_agent, ip_address, created_at, last_used_at, expires_at
     FROM refresh_sessions
     WHERE user_id = $1 AND expires_at > CURRENT_TIMESTAMP
     ORDER BY last_used_at DESC, id DESC`,
    [req.user.id]
  );

  return res.status(200).json({
    data: result.rows.map((session) => ({
      id: Number(session.id),
      userAgent: session.user_agent,
      ipAddress: session.ip_address,
      createdAt: session.created_at,
      lastUsedAt: session.last_used_at,
      expiresAt: session.expires_at,
      current: Number(session.id) === Number(req.user.sessionId)
    }))
  });
};

const revokeSession = async (req, res, next) => {
  const result = await req.app.locals.db.query(
    "DELETE FROM refresh_sessions WHERE id = $1 AND user_id = $2 RETURNING id",
    [req.params.id, req.user.id]
  );
  if (result.rows.length === 0) {
    return next(new AppError(404, "SESSION_NOT_FOUND", "Session not found."));
  }
  return res.status(204).send();
};

const revokeAllSessions = async (req, res) => {
  const client = await req.app.locals.db.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM refresh_sessions WHERE user_id = $1", [req.user.id]);
    await client.query("UPDATE users SET auth_version = auth_version + 1 WHERE id = $1", [
      req.user.id
    ]);
    await client.query("COMMIT");
    clearRefreshCookie(res, req.app.locals.config);
    return res.status(204).send();
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  createRefreshSession,
  getCurrentUser,
  listSessions,
  login,
  logout,
  refresh,
  register,
  revokeAllSessions,
  revokeSession,
  sendSession
};
