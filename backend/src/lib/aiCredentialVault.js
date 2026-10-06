const { createCipheriv, createDecipheriv, randomBytes } = require("node:crypto");

const { AppError } = require("./errors");
const { currentWorkspace } = require("./workspaceContext");
const { ensurePersonalWorkspace } = require("./personalWorkspace");

const ENCRYPTION_VERSION = 1;
const PROVIDERS = ["openai", "anthropic", "google"];

const requireVaultConfig = (config) => {
  const keys = config.aiCredentialMasterKeys || {};
  const activeVersion = Number(config.aiCredentialActiveKeyVersion);
  if (
    !config.aiCredentialVaultEnabled ||
    !Number.isSafeInteger(activeVersion) ||
    !Buffer.isBuffer(keys[activeVersion]) ||
    keys[activeVersion].length !== 32
  ) {
    throw new AppError(
      503,
      "AI_CREDENTIAL_VAULT_NOT_CONFIGURED",
      "Personal AI provider credentials are not configured on this deployment."
    );
  }
  return { activeVersion, keys };
};

const aadFor = ({ userId, provider, keyVersion, workspaceId, encryptionVersion = 1 }) =>
  Buffer.from(
    `workflowhq:ai-credential:v${encryptionVersion}:user:${userId}:provider:${provider}:key:${keyVersion}${encryptionVersion === 2 ? `:workspace:${workspaceId}` : ""}`,
    "utf8"
  );

const encryptCredential = ({ credential, provider, userId, workspaceId }, config) => {
  const { activeVersion, keys } = requireVaultConfig(config);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keys[activeVersion], iv);
  const encryptionVersion = workspaceId ? 2 : 1;
  cipher.setAAD(
    aadFor({ userId, provider, keyVersion: activeVersion, workspaceId, encryptionVersion })
  );
  const ciphertext = Buffer.concat([cipher.update(credential, "utf8"), cipher.final()]);
  return {
    encryptionVersion,
    keyVersion: activeVersion,
    ciphertext: ciphertext.toString("base64url"),
    iv: iv.toString("base64url"),
    authTag: cipher.getAuthTag().toString("base64url"),
    maskedSuffix: `••••${credential.slice(-4)}`
  };
};

const decryptCredential = (record, config) => {
  const { keys } = requireVaultConfig(config);
  const keyVersion = Number(record.key_version);
  const key = keys[keyVersion];
  if (!key || ![1, 2].includes(Number(record.encryption_version))) {
    throw new AppError(
      503,
      "AI_CREDENTIAL_UNAVAILABLE",
      "The saved provider credential cannot be read with the configured encryption keys."
    );
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(record.iv, "base64url"));
    decipher.setAAD(
      aadFor({
        userId: record.user_id,
        provider: record.provider,
        keyVersion,
        workspaceId: record.workspace_id,
        encryptionVersion: Number(record.encryption_version)
      })
    );
    decipher.setAuthTag(Buffer.from(record.auth_tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(record.ciphertext, "base64url")),
      decipher.final()
    ]).toString("utf8");
  } catch {
    throw new AppError(
      503,
      "AI_CREDENTIAL_UNAVAILABLE",
      "The saved provider credential failed its integrity check. Replace it before continuing."
    );
  }
};

const loadCredential = async (db, { provider, userId }, config) => {
  requireVaultConfig(config);
  const result = await db.query(
    `SELECT user_id, workspace_id, provider, encryption_version, key_version, ciphertext, iv, auth_tag
     FROM ai_provider_credentials
     WHERE user_id = $1 AND provider = $2 AND workspace_id = $3`,
    [userId, provider, currentWorkspace() || (await ensurePersonalWorkspace(db, { id: userId }))]
  );
  if (!result.rows[0]) {
    throw new AppError(
      409,
      "AI_CREDENTIAL_REQUIRED",
      "Save a personal credential for this provider before generating a plan."
    );
  }
  return decryptCredential(result.rows[0], config);
};

module.exports = {
  ENCRYPTION_VERSION,
  PROVIDERS,
  decryptCredential,
  encryptCredential,
  loadCredential,
  requireVaultConfig
};
