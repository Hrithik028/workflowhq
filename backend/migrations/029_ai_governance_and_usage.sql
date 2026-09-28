CREATE TABLE IF NOT EXISTS ai_governance_settings (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  provider_policies JSONB NOT NULL DEFAULT '[]'::jsonb,
  daily_run_limit INTEGER NOT NULL DEFAULT 20 CHECK (daily_run_limit BETWEEN 1 AND 1000),
  max_prompt_characters INTEGER NOT NULL DEFAULT 30000 CHECK (max_prompt_characters BETWEEN 1000 AND 100000),
  max_output_tokens INTEGER NOT NULL DEFAULT 5000 CHECK (max_output_tokens BETWEEN 256 AND 20000),
  max_proposed_actions INTEGER NOT NULL DEFAULT 25 CHECK (max_proposed_actions BETWEEN 1 AND 100),
  request_timeout_ms INTEGER NOT NULL DEFAULT 30000 CHECK (request_timeout_ms BETWEEN 5000 AND 120000),
  retention_days INTEGER NOT NULL DEFAULT 30 CHECK (retention_days BETWEEN 1 AND 365),
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO ai_governance_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS ai_daily_usage (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL,
  run_count INTEGER NOT NULL DEFAULT 0 CHECK (run_count >= 0),
  prompt_characters INTEGER NOT NULL DEFAULT 0 CHECK (prompt_characters >= 0),
  estimated_output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (estimated_output_tokens >= 0),
  proposed_actions INTEGER NOT NULL DEFAULT 0 CHECK (proposed_actions >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, usage_date)
);

CREATE TABLE IF NOT EXISTS ai_usage_events (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  provider VARCHAR(32) NOT NULL,
  model VARCHAR(120) NOT NULL,
  operation VARCHAR(32) NOT NULL CHECK (operation IN ('preview', 'apply')),
  outcome VARCHAR(32) NOT NULL CHECK (outcome IN ('succeeded', 'failed', 'denied')),
  error_code VARCHAR(80),
  prompt_characters INTEGER NOT NULL DEFAULT 0 CHECK (prompt_characters >= 0),
  estimated_output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (estimated_output_tokens >= 0),
  proposed_actions INTEGER NOT NULL DEFAULT 0 CHECK (proposed_actions >= 0),
  latency_ms INTEGER NOT NULL DEFAULT 0 CHECK (latency_ms >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_created
  ON ai_usage_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_provider_created
  ON ai_usage_events(provider, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_user_created
  ON ai_usage_events(user_id, created_at DESC);
