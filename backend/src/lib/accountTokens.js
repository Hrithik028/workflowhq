const { createHash, randomBytes } = require("node:crypto");

const hashAccountToken = (token) => createHash("sha256").update(token).digest("hex");

const issueAccountToken = async (db, { userId, purpose, ttlMinutes }) => {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
  await db.query(
    "DELETE FROM account_tokens WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL",
    [userId, purpose]
  );
  await db.query(
    `INSERT INTO account_tokens (user_id, purpose, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [userId, purpose, hashAccountToken(token), expiresAt]
  );
  return token;
};

module.exports = { hashAccountToken, issueAccountToken };
