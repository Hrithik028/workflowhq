ALTER TABLE github_installations
  ADD COLUMN IF NOT EXISTS disconnected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_webhook_at TIMESTAMPTZ;

ALTER TABLE github_repositories
  ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;

-- Unknown-installation deliveries are still recorded for replay protection, but
-- can never mutate installation, repository, project, or task data.
ALTER TABLE github_webhook_deliveries
  ALTER COLUMN user_id DROP NOT NULL,
  ALTER COLUMN installation_id DROP NOT NULL;

ALTER TABLE task_development_links
  DROP CONSTRAINT IF EXISTS task_development_links_repository_id_link_type_external_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_task_development_link_event
  ON task_development_links(task_id, repository_id, link_type, external_id);

CREATE TABLE IF NOT EXISTS github_development_events (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  repository_id BIGINT NOT NULL,
  event_type VARCHAR(30) NOT NULL
    CHECK (event_type IN ('commit', 'pull_request', 'check_run', 'deployment', 'release')),
  external_id VARCHAR(255) NOT NULL,
  github_node_id VARCHAR(255),
  github_number BIGINT,
  title VARCHAR(500) NOT NULL,
  url TEXT NOT NULL,
  state VARCHAR(50),
  actor_login VARCHAR(255),
  occurred_at TIMESTAMPTZ NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (id, user_id),
  UNIQUE (repository_id, event_type, external_id),
  CONSTRAINT github_development_events_repository_owner_fk
    FOREIGN KEY (repository_id, user_id) REFERENCES github_repositories(id, user_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_github_development_events_repository_time
  ON github_development_events(user_id, repository_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS github_development_event_tasks (
  event_id BIGINT NOT NULL REFERENCES github_development_events(id) ON DELETE CASCADE,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  link_source VARCHAR(20) NOT NULL DEFAULT 'automatic'
    CHECK (link_source IN ('automatic', 'manual')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id, task_id)
);

CREATE INDEX IF NOT EXISTS idx_github_development_event_tasks_task
  ON github_development_event_tasks(task_id, created_at DESC);
