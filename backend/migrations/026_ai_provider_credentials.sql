CREATE TABLE IF NOT EXISTS ai_provider_credentials (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(20) NOT NULL
    CHECK (provider IN ('openai', 'anthropic', 'google')),
  encryption_version SMALLINT NOT NULL DEFAULT 1
    CHECK (encryption_version = 1),
  key_version INTEGER NOT NULL CHECK (key_version > 0),
  ciphertext TEXT NOT NULL,
  iv VARCHAR(32) NOT NULL,
  auth_tag VARCHAR(32) NOT NULL,
  masked_suffix VARCHAR(8) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_ai_provider_credentials_user
  ON ai_provider_credentials(user_id);

CREATE TABLE IF NOT EXISTS ai_credential_audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action VARCHAR(32) NOT NULL
    CHECK (action IN ('credential_saved', 'credential_replaced', 'credential_removed')),
  provider VARCHAR(20) NOT NULL
    CHECK (provider IN ('openai', 'anthropic', 'google')),
  key_version INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_credential_audit_user_created
  ON ai_credential_audit_log(user_id, created_at DESC);
