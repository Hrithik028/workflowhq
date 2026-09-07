CREATE TABLE IF NOT EXISTS github_identity_mappings (
  id BIGSERIAL PRIMARY KEY,
  installation_id BIGINT NOT NULL REFERENCES github_installations(id) ON DELETE CASCADE,
  github_login VARCHAR(255) NOT NULL,
  github_login_normalized VARCHAR(255) NOT NULL,
  mapped_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mapped_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (installation_id, github_login_normalized),
  UNIQUE (installation_id, mapped_user_id),
  CHECK (github_login_normalized = LOWER(github_login_normalized))
);

CREATE INDEX IF NOT EXISTS idx_github_identity_mappings_user
  ON github_identity_mappings(mapped_user_id, installation_id);

ALTER TABLE github_webhook_deliveries
  ADD COLUMN IF NOT EXISTS redelivery_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS redelivery_requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS redelivery_request_count INTEGER NOT NULL DEFAULT 0
    CHECK (redelivery_request_count >= 0);

CREATE INDEX IF NOT EXISTS idx_github_webhook_failures_owner
  ON github_webhook_deliveries(user_id, status, received_at DESC);
