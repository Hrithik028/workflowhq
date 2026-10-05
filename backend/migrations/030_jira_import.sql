CREATE TABLE jira_import_previews (
  id UUID PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_url TEXT NOT NULL,
  jira_project_key VARCHAR(20) NOT NULL,
  issues_hash CHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_jira_import_previews_expiry ON jira_import_previews(expires_at);

CREATE TABLE jira_issue_mappings (
  id BIGSERIAL PRIMARY KEY,
  site_url TEXT NOT NULL,
  jira_project_key VARCHAR(20) NOT NULL,
  jira_issue_key VARCHAR(50) NOT NULL,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id INTEGER NOT NULL UNIQUE REFERENCES tasks(id) ON DELETE CASCADE,
  imported_by INTEGER NOT NULL REFERENCES users(id),
  imported_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(site_url, jira_issue_key)
);

CREATE INDEX idx_jira_issue_mappings_project ON jira_issue_mappings(project_id);
