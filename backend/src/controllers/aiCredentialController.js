const { createAiCredentialValidator } = require("../lib/aiCredentialValidator");
const { PROVIDERS, encryptCredential, requireVaultConfig } = require("../lib/aiCredentialVault");
const { AppError } = require("../lib/errors");

const serialize = (row) => ({
  provider: row.provider,
  configured: true,
  maskedSuffix: row.masked_suffix,
  keyVersion: Number(row.key_version),
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const listCredentials = async (req, res) => {
  requireVaultConfig(req.app.locals.config);
  const result = await req.app.locals.db.query(
    `SELECT provider, masked_suffix, key_version, created_at, updated_at
     FROM ai_provider_credentials
     WHERE user_id = $1`,
    [req.user.id]
  );
  const byProvider = new Map(result.rows.map((row) => [row.provider, serialize(row)]));
  return res.status(200).json({
    data: PROVIDERS.map(
      (provider) =>
        byProvider.get(provider) || {
          provider,
          configured: false,
          maskedSuffix: null,
          keyVersion: null,
          createdAt: null,
          updatedAt: null
        }
    )
  });
};

const validateCredential = async (req, res) => {
  requireVaultConfig(req.app.locals.config);
  const validator =
    req.app.locals.aiCredentialValidator || createAiCredentialValidator(req.app.locals.config);
  await validator.validate(req.body.provider, req.body.credential);
  return res.status(200).json({ data: { provider: req.body.provider, valid: true } });
};

const writeCredential = async (req, res, { mode }) => {
  requireVaultConfig(req.app.locals.config);
  const provider = mode === "create" ? req.body.provider : req.params.provider;
  const encrypted = encryptCredential(
    { credential: req.body.credential, provider, userId: req.user.id },
    req.app.locals.config
  );
  const client = await req.app.locals.db.connect();
  try {
    await client.query("BEGIN");
    let result;
    if (mode === "create") {
      result = await client.query(
        `INSERT INTO ai_provider_credentials
           (user_id, provider, encryption_version, key_version, ciphertext, iv, auth_tag, masked_suffix)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING provider, masked_suffix, key_version, created_at, updated_at`,
        [
          req.user.id,
          provider,
          encrypted.encryptionVersion,
          encrypted.keyVersion,
          encrypted.ciphertext,
          encrypted.iv,
          encrypted.authTag,
          encrypted.maskedSuffix
        ]
      );
    } else {
      result = await client.query(
        `UPDATE ai_provider_credentials
         SET encryption_version = $3, key_version = $4, ciphertext = $5, iv = $6,
             auth_tag = $7, masked_suffix = $8,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND provider = $2
         RETURNING provider, masked_suffix, key_version, created_at, updated_at`,
        [
          req.user.id,
          provider,
          encrypted.encryptionVersion,
          encrypted.keyVersion,
          encrypted.ciphertext,
          encrypted.iv,
          encrypted.authTag,
          encrypted.maskedSuffix
        ]
      );
      if (!result.rows[0]) {
        throw new AppError(
          404,
          "AI_CREDENTIAL_NOT_FOUND",
          "No saved credential exists for that provider."
        );
      }
    }
    await client.query(
      `INSERT INTO ai_credential_audit_log (user_id, action, provider, key_version)
       VALUES ($1, $2, $3, $4)`,
      [
        req.user.id,
        mode === "create" ? "credential_saved" : "credential_replaced",
        provider,
        encrypted.keyVersion
      ]
    );
    await client.query("COMMIT");
    return res.status(mode === "create" ? 201 : 200).json({ data: serialize(result.rows[0]) });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") {
      throw new AppError(
        409,
        "AI_CREDENTIAL_EXISTS",
        "A credential is already saved for that provider. Replace it instead."
      );
    }
    throw error;
  } finally {
    client.release();
  }
};

const saveCredential = (req, res) => writeCredential(req, res, { mode: "create" });
const replaceCredential = (req, res) => writeCredential(req, res, { mode: "replace" });

const removeCredential = async (req, res) => {
  requireVaultConfig(req.app.locals.config);
  const client = await req.app.locals.db.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `DELETE FROM ai_provider_credentials
       WHERE user_id = $1 AND provider = $2
       RETURNING key_version`,
      [req.user.id, req.params.provider]
    );
    if (!result.rows[0]) {
      throw new AppError(
        404,
        "AI_CREDENTIAL_NOT_FOUND",
        "No saved credential exists for that provider."
      );
    }
    await client.query(
      `INSERT INTO ai_credential_audit_log (user_id, action, provider, key_version)
       VALUES ($1, 'credential_removed', $2, $3)`,
      [req.user.id, req.params.provider, Number(result.rows[0].key_version)]
    );
    await client.query("COMMIT");
    return res.status(204).send();
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  listCredentials,
  removeCredential,
  replaceCredential,
  saveCredential,
  validateCredential
};
