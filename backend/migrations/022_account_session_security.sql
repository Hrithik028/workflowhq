ALTER TABLE refresh_sessions
  ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45),
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_refresh_sessions_user_activity
  ON refresh_sessions(user_id, last_used_at DESC);
