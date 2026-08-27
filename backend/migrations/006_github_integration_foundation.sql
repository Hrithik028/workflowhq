-- GitHub App installation metadata only. Installation access tokens are short lived
-- and must be generated on demand; OAuth tokens and private keys never belong here.
CREATE TABLE github_installations (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  github_installation_id BIGINT NOT NULL UNIQUE,
  github_account_id BIGINT NOT NULL,
  account_login VARCHAR(255) NOT NULL,
  account_type VARCHAR(20) NOT NULL CHECK (account_type IN ('User', 'Organization')),
  repository_selection VARCHAR(20) NOT NULL CHECK (repository_selection IN ('all', 'selected')),
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  suspended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (id, user_id)
);

-- Composite keys make every integration reference carry the owning user.
CREATE UNIQUE INDEX uq_projects_id_user ON projects(id, user_id);
CREATE UNIQUE INDEX uq_tasks_id_user ON tasks(id, user_id);

CREATE TABLE github_repositories (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  installation_id BIGINT NOT NULL,
  github_repository_id BIGINT NOT NULL UNIQUE,
  github_node_id VARCHAR(255) NOT NULL,
  owner_login VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  full_name VARCHAR(512) NOT NULL,
  html_url TEXT NOT NULL,
  default_branch VARCHAR(255) NOT NULL DEFAULT 'main',
  is_private BOOLEAN NOT NULL DEFAULT FALSE,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  selected BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (id, user_id),
  UNIQUE (installation_id, full_name),
  CONSTRAINT github_repositories_installation_owner_fk
    FOREIGN KEY (installation_id, user_id) REFERENCES github_installations(id, user_id)
    ON DELETE CASCADE
);

CREATE INDEX idx_github_repositories_user_selected
  ON github_repositories(user_id, selected, updated_at DESC);

-- Project assignment is kept in a mapping table so deleting a project removes
-- only the assignment, never the repository metadata or its development history.
CREATE TABLE github_repository_project_links (
  repository_id BIGINT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT github_repository_project_links_repository_owner_fk
    FOREIGN KEY (repository_id, user_id) REFERENCES github_repositories(id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT github_repository_project_links_project_owner_fk
    FOREIGN KEY (project_id, user_id) REFERENCES projects(id, user_id)
    ON DELETE CASCADE
);

CREATE INDEX idx_github_repository_project_links_project
  ON github_repository_project_links(user_id, project_id);

-- Replay-safe delivery ledger. Raw webhook payloads are intentionally not retained.
CREATE TABLE github_webhook_deliveries (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  installation_id BIGINT NOT NULL,
  github_delivery_id VARCHAR(100) NOT NULL UNIQUE,
  event_name VARCHAR(100) NOT NULL,
  event_action VARCHAR(100),
  payload_sha256 CHAR(64) NOT NULL,
  signature_verified_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'processing', 'processed', 'ignored', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  error_message TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMPTZ,
  CONSTRAINT github_webhook_deliveries_installation_owner_fk
    FOREIGN KEY (installation_id, user_id) REFERENCES github_installations(id, user_id)
    ON DELETE CASCADE
);

CREATE INDEX idx_github_webhook_deliveries_processing
  ON github_webhook_deliveries(status, received_at) WHERE status IN ('received', 'failed');
CREATE INDEX idx_github_webhook_deliveries_user_received
  ON github_webhook_deliveries(user_id, received_at DESC);

CREATE TABLE task_development_links (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id INTEGER NOT NULL,
  repository_id BIGINT NOT NULL,
  link_type VARCHAR(30) NOT NULL
    CHECK (link_type IN ('branch', 'commit', 'pull_request', 'issue', 'deployment', 'release', 'check_run')),
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
  CONSTRAINT task_development_links_task_owner_fk
    FOREIGN KEY (task_id, user_id) REFERENCES tasks(id, user_id) ON DELETE CASCADE,
  CONSTRAINT task_development_links_repository_owner_fk
    FOREIGN KEY (repository_id, user_id) REFERENCES github_repositories(id, user_id)
    ON DELETE CASCADE,
  UNIQUE (repository_id, link_type, external_id)
);

CREATE INDEX idx_task_development_links_task_time
  ON task_development_links(user_id, task_id, occurred_at DESC);
CREATE INDEX idx_task_development_links_repository_time
  ON task_development_links(user_id, repository_id, occurred_at DESC);
