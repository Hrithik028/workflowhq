CREATE TABLE IF NOT EXISTS ai_conversations (
  id VARCHAR(36) PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(160) NOT NULL,
  provider VARCHAR(30) NOT NULL,
  model VARCHAR(120) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  detail_expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ai_conversations_provider_check CHECK (provider IN ('openai', 'anthropic', 'google')),
  CONSTRAINT ai_conversations_status_check CHECK (status IN ('active', 'discarded'))
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_project_updated
  ON ai_conversations(project_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_conversation_messages (
  id BIGSERIAL PRIMARY KEY,
  conversation_id VARCHAR(36) NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  role VARCHAR(20) NOT NULL,
  content TEXT,
  content_sha256 VARCHAR(64),
  detail_expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ai_conversation_messages_role_check CHECK (role IN ('user', 'assistant'))
);

CREATE INDEX IF NOT EXISTS idx_ai_conversation_messages_conversation
  ON ai_conversation_messages(conversation_id, created_at, id);

CREATE TABLE IF NOT EXISTS ai_conversation_runs (
  id VARCHAR(36) PRIMARY KEY,
  conversation_id VARCHAR(36) NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  requested_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL,
  provider VARCHAR(30) NOT NULL,
  model VARCHAR(120) NOT NULL,
  error_code VARCHAR(80),
  evidence_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ,
  CONSTRAINT ai_conversation_runs_status_check CHECK (status IN ('running', 'completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_ai_conversation_runs_conversation
  ON ai_conversation_runs(conversation_id, started_at DESC);

CREATE TABLE IF NOT EXISTS ai_proposal_revisions (
  id VARCHAR(36) PRIMARY KEY,
  conversation_id VARCHAR(36) NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  run_id VARCHAR(36) NOT NULL UNIQUE REFERENCES ai_conversation_runs(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL,
  approval_id VARCHAR(36) REFERENCES ai_plan_approvals(id) ON DELETE SET NULL,
  state VARCHAR(20) NOT NULL DEFAULT 'pending',
  summary VARCHAR(1000),
  plan JSONB,
  diff JSONB,
  evidence_summary JSONB,
  expires_at TIMESTAMPTZ NOT NULL,
  detail_expires_at TIMESTAMPTZ NOT NULL,
  superseded_at TIMESTAMPTZ,
  discarded_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ai_proposal_revisions_state_check
    CHECK (state IN ('pending', 'superseded', 'discarded', 'applied')),
  CONSTRAINT ai_proposal_revisions_number_check CHECK (revision_number > 0),
  CONSTRAINT ai_proposal_revisions_unique_revision UNIQUE (conversation_id, revision_number)
);

CREATE INDEX IF NOT EXISTS idx_ai_proposal_revisions_conversation
  ON ai_proposal_revisions(conversation_id, revision_number DESC);

ALTER TABLE ai_plan_approvals
  ADD COLUMN IF NOT EXISTS proposal_revision_id VARCHAR(36)
    REFERENCES ai_proposal_revisions(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_plan_approvals_proposal_revision
  ON ai_plan_approvals(proposal_revision_id)
  WHERE proposal_revision_id IS NOT NULL;
