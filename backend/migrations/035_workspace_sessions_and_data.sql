ALTER TABLE refresh_sessions ADD COLUMN workspace_id BIGINT REFERENCES workspaces(id);
CREATE UNIQUE INDEX workspace_one_owner ON workspace_members(workspace_id) WHERE role = 'owner';
ALTER TABLE refresh_sessions ADD COLUMN workspace_version INTEGER NOT NULL DEFAULT 0;
UPDATE refresh_sessions SET workspace_id = workspaces.id FROM workspaces
WHERE refresh_sessions.user_id = workspaces.personal_owner_id;

CREATE UNIQUE INDEX uq_projects_workspace_key ON projects(workspace_id, key);
DROP INDEX uq_projects_user_key;
DROP INDEX projects_workspace_idx;
CREATE UNIQUE INDEX uq_projects_workspace_id ON projects(id, workspace_id);
CREATE INDEX projects_workspace_idx ON projects(workspace_id);

ALTER TABLE tasks ADD COLUMN workspace_id BIGINT REFERENCES workspaces(id);
UPDATE tasks SET workspace_id = projects.workspace_id FROM projects WHERE tasks.project_id = projects.id;
UPDATE tasks SET workspace_id = workspaces.id FROM workspaces
WHERE tasks.workspace_id IS NULL AND tasks.user_id = workspaces.personal_owner_id;
CREATE INDEX tasks_workspace_idx ON tasks(workspace_id, project_id);
ALTER TABLE tasks ADD CONSTRAINT tasks_workspace_project_fk
FOREIGN KEY(project_id, workspace_id) REFERENCES projects(id, workspace_id);

ALTER TABLE activities ADD COLUMN workspace_id BIGINT REFERENCES workspaces(id);
UPDATE activities SET workspace_id = projects.workspace_id FROM projects
WHERE activities.entity_type = 'project' AND activities.entity_id = projects.id;
UPDATE activities SET workspace_id = tasks.workspace_id FROM tasks
WHERE activities.entity_type = 'task' AND activities.entity_id = tasks.id;
UPDATE activities SET workspace_id = workspaces.id FROM workspaces
WHERE activities.workspace_id IS NULL AND activities.user_id = workspaces.personal_owner_id;
CREATE INDEX activities_workspace_idx ON activities(workspace_id, user_id, created_at);

ALTER TABLE github_installations ADD COLUMN workspace_id BIGINT REFERENCES workspaces(id);
UPDATE github_installations SET workspace_id = workspaces.id FROM workspaces
WHERE github_installations.user_id = workspaces.personal_owner_id;
-- One installation cannot straddle multiple workspaces. Abort rather than
-- silently assigning existing linked repository data to an arbitrary tenant.
CREATE TABLE workspace_connection_migration_guard (conflict_count INTEGER CONSTRAINT installation_multiple_workspaces CHECK(conflict_count = 0));
INSERT INTO workspace_connection_migration_guard
SELECT COUNT(*)::int FROM (
  SELECT gr.installation_id, COUNT(DISTINCT p.workspace_id) AS workspace_count FROM github_repositories gr
  JOIN project_github_repositories links ON links.repository_id = gr.id
  JOIN projects p ON p.id = links.project_id
  GROUP BY gr.installation_id
) conflicts WHERE workspace_count > 1;
DROP TABLE workspace_connection_migration_guard;
UPDATE github_installations SET workspace_id = linked.workspace_id
FROM (SELECT gr.installation_id, p.workspace_id FROM github_repositories gr
JOIN project_github_repositories links ON links.repository_id = gr.id
JOIN projects p ON p.id = links.project_id) linked
WHERE github_installations.id = linked.installation_id;
ALTER TABLE github_repositories ADD COLUMN workspace_id BIGINT REFERENCES workspaces(id);
UPDATE github_repositories SET workspace_id = github_installations.workspace_id FROM github_installations
WHERE github_repositories.installation_id = github_installations.id;
ALTER TABLE github_connection_states ADD COLUMN workspace_id BIGINT REFERENCES workspaces(id);
UPDATE github_connection_states SET workspace_id = workspaces.id FROM workspaces
WHERE github_connection_states.user_id = workspaces.personal_owner_id;

ALTER TABLE notifications ADD COLUMN workspace_id BIGINT REFERENCES workspaces(id);
UPDATE notifications SET workspace_id = projects.workspace_id FROM projects WHERE notifications.project_id = projects.id;
UPDATE notifications SET workspace_id = workspaces.id FROM workspaces
WHERE notifications.workspace_id IS NULL AND notifications.user_id = workspaces.personal_owner_id;
CREATE INDEX notifications_workspace_idx ON notifications(workspace_id, user_id, created_at);

ALTER TABLE ai_provider_credentials ADD COLUMN workspace_id BIGINT REFERENCES workspaces(id);
UPDATE ai_provider_credentials SET workspace_id = workspaces.id FROM workspaces
WHERE ai_provider_credentials.user_id = workspaces.personal_owner_id;
ALTER TABLE ai_provider_credentials DROP CONSTRAINT ai_provider_credentials_user_id_provider_key;
CREATE UNIQUE INDEX ai_credentials_workspace_provider_key ON ai_provider_credentials(user_id, workspace_id, provider);
ALTER TABLE ai_provider_credentials DROP CONSTRAINT ai_provider_credentials_encryption_version_check;
ALTER TABLE ai_provider_credentials ADD CONSTRAINT ai_provider_credentials_encryption_version_check CHECK(encryption_version IN (1, 2));

CREATE TABLE workspace_settings (
  workspace_id BIGINT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  rules JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE workspace_audit_log (
  id BIGSERIAL PRIMARY KEY,
  workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(60) NOT NULL,
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
