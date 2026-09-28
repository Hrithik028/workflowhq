CREATE TABLE IF NOT EXISTS ai_plan_approvals (
  id VARCHAR(36) PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  summary_hash VARCHAR(64) NOT NULL,
  task_hashes JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_plan_approvals_lookup
  ON ai_plan_approvals(user_id, project_id, expires_at DESC);
