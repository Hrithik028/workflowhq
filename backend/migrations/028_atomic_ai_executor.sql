ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1
    CHECK (version > 0);

CREATE TABLE IF NOT EXISTS ai_plan_executions (
  id BIGSERIAL PRIMARY KEY,
  approval_id VARCHAR(36) NOT NULL UNIQUE
    REFERENCES ai_plan_approvals(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  idempotency_key VARCHAR(100) NOT NULL,
  response JSONB,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, project_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_ai_plan_executions_project
  ON ai_plan_executions(project_id, created_at DESC);
