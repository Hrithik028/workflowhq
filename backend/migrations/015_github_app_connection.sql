-- Additive GitHub App connection and repository-sync state. Migration 006 is
-- intentionally preserved because it is already deployed.
CREATE TABLE github_connection_states (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  state_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (expires_at > created_at)
);

CREATE INDEX idx_github_connection_states_active
  ON github_connection_states(expires_at)
  WHERE consumed_at IS NULL;

ALTER TABLE github_installations
  ADD COLUMN connection_status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (connection_status IN ('active', 'suspended', 'revoked', 'error')),
  ADD COLUMN last_verified_at TIMESTAMPTZ,
  ADD COLUMN sync_status VARCHAR(20) NOT NULL DEFAULT 'never'
    CHECK (sync_status IN ('never', 'queued', 'syncing', 'succeeded', 'partial', 'failed')),
  ADD COLUMN last_synced_at TIMESTAMPTZ,
  ADD COLUMN last_sync_error VARCHAR(500);

ALTER TABLE github_repositories
  ADD COLUMN github_updated_at TIMESTAMPTZ,
  ADD COLUMN pushed_at TIMESTAMPTZ,
  ADD COLUMN removed_at TIMESTAMPTZ,
  ADD COLUMN sync_status VARCHAR(20) NOT NULL DEFAULT 'never'
    CHECK (sync_status IN ('never', 'queued', 'syncing', 'succeeded', 'partial', 'failed')),
  ADD COLUMN last_synced_at TIMESTAMPTZ,
  ADD COLUMN last_sync_error VARCHAR(500),
  ADD COLUMN history_synced_through TIMESTAMPTZ;

-- Migration 006 linked repositories to the immutable project creator. Keep
-- that deployed table intact and introduce the membership-aware association
-- used by the new code. This is safe for rollback and supports shared projects.
CREATE TABLE project_github_repositories (
  repository_id BIGINT NOT NULL REFERENCES github_repositories(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  linked_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (repository_id)
);

CREATE INDEX idx_project_github_repositories_project
  ON project_github_repositories(project_id, repository_id);

INSERT INTO project_github_repositories (repository_id, project_id, linked_by, created_at, updated_at)
SELECT repository_id, project_id, user_id, created_at, updated_at
FROM github_repository_project_links
ON CONFLICT (repository_id) DO NOTHING;

CREATE TABLE github_sync_runs (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  installation_id BIGINT NOT NULL,
  trigger VARCHAR(20) NOT NULL CHECK (trigger IN ('install', 'manual')),
  status VARCHAR(20) NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'partial', 'failed')),
  repository_count INTEGER NOT NULL DEFAULT 0 CHECK (repository_count >= 0),
  processed_event_count INTEGER NOT NULL DEFAULT 0 CHECK (processed_event_count >= 0),
  failed_repository_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_repository_count >= 0),
  history_since TIMESTAMPTZ,
  rate_limit_remaining INTEGER CHECK (rate_limit_remaining IS NULL OR rate_limit_remaining >= 0),
  rate_limit_reset_at TIMESTAMPTZ,
  error_message VARCHAR(500),
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ,
  CONSTRAINT github_sync_runs_installation_owner_fk
    FOREIGN KEY (installation_id, user_id) REFERENCES github_installations(id, user_id)
    ON DELETE CASCADE
);

CREATE INDEX idx_github_sync_runs_installation_started
  ON github_sync_runs(user_id, installation_id, started_at DESC);
