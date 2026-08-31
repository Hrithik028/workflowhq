const { createHash, randomBytes } = require("node:crypto");

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const { AppError } = require("../lib/errors");

const hashRefreshToken = (token) => createHash("sha256").update(token).digest("hex");

const createAccessToken = (user, config) =>
  jwt.sign(
    {
      email: user.email,
      role: user.role,
      authVersion: Number(user.auth_version || 0),
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

const createRefreshSession = async (db, userId, req) => {
  const config = req.app.locals.config;
  const token = randomBytes(48).toString("base64url");
  const expiresAt = new Date(Date.now() + config.refreshTokenDays * 24 * 60 * 60 * 1000);

  await db.query(
    `INSERT INTO refresh_sessions (user_id, token_hash, user_agent, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [userId, hashRefreshToken(token), req.get("user-agent")?.slice(0, 500) || null, expiresAt]
  );

  return token;
};

const sendSession = (res, req, status, user, refreshToken) => {
  const config = req.app.locals.config;
  res.cookie(config.refreshCookieName, refreshToken, refreshCookieOptions(config));
  return res.status(status).json({
    data: {
      accessToken: createAccessToken(user, config),
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
    const result = await client.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email, role, auth_version, created_at`,
      [req.body.name, req.body.email, passwordHash]
    );
    const user = result.rows[0];
    const refreshToken = await createRefreshSession(client, user.id, req);
    await client.query("COMMIT");
    return sendSession(res, req, 201, user, refreshToken);
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

  const safeUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    auth_version: user.auth_version,
    created_at: user.created_at
  };
  const refreshToken = await createRefreshSession(db, user.id, req);
  return sendSession(res, req, 200, safeUser, refreshToken);
};

const refresh = async (req, res, next) => {
  const config = req.app.locals.config;
  const token = req.cookies[config.refreshCookieName];
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
       RETURNING user_id`,
      [hashRefreshToken(token)]
    );

    if (sessionResult.rows.length === 0) {
      await client.query("ROLLBACK");
      clearRefreshCookie(res, config);
      return next(new AppError(401, "REFRESH_INVALID", "Your session is no longer valid."));
    }

    const userResult = await client.query(
      "SELECT id, name, email, role, auth_version, created_at FROM users WHERE id = $1",
      [sessionResult.rows[0].user_id]
    );
    if (userResult.rows.length === 0) {
      await client.query("ROLLBACK");
      clearRefreshCookie(res, config);
      return next(new AppError(401, "REFRESH_INVALID", "Your session is no longer valid."));
    }

    const user = userResult.rows[0];
    const nextRefreshToken = await createRefreshSession(client, user.id, req);
    await client.query("COMMIT");

    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      auth_version: user.auth_version,
      created_at: user.created_at
    };
    return sendSession(res, req, 200, safeUser, nextRefreshToken);
  } catch (error) {
    await client.query("ROLLBACK");
    return next(error);
  } finally {
    client.release();
  }
};

const logout = async (req, res) => {
  const config = req.app.locals.config;
  const token = req.cookies[config.refreshCookieName];
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
    "SELECT id, name, email, role, auth_version, created_at FROM users WHERE id = $1",
    [req.user.id]
  );
  if (result.rows.length === 0) {
    return next(new AppError(404, "USER_NOT_FOUND", "User not found."));
  }
  return res.status(200).json({ data: result.rows[0] });
};

module.exports = { getCurrentUser, login, logout, refresh, register };
