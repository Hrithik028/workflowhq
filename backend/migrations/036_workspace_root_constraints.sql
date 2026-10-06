-- Reconcile legacy roots before enforcing mandatory tenant ownership.
INSERT INTO workspaces (slug, name, created_by, personal_owner_id)
SELECT 'personal-' || id::text, name || '''s workspace', id, id FROM users
ON CONFLICT (personal_owner_id) DO NOTHING;
INSERT INTO workspace_members (workspace_id, user_id, role, source)
SELECT id, personal_owner_id, 'owner', 'personal' FROM workspaces
WHERE personal_owner_id IS NOT NULL ON CONFLICT (workspace_id, user_id) DO NOTHING;
UPDATE projects SET workspace_id = w.id FROM workspaces w
WHERE projects.workspace_id IS NULL AND projects.user_id = w.personal_owner_id;
UPDATE tasks SET workspace_id = p.workspace_id FROM projects p
WHERE tasks.workspace_id IS NULL AND tasks.project_id = p.id;
UPDATE tasks SET workspace_id = w.id FROM workspaces w
WHERE tasks.workspace_id IS NULL AND tasks.user_id = w.personal_owner_id;
UPDATE activities SET workspace_id = p.workspace_id FROM projects p
WHERE activities.workspace_id IS NULL AND activities.entity_type = 'project' AND activities.entity_id = p.id;
UPDATE activities SET workspace_id = t.workspace_id FROM tasks t
WHERE activities.workspace_id IS NULL AND activities.entity_type = 'task' AND activities.entity_id = t.id;
UPDATE activities SET workspace_id = w.id FROM workspaces w
WHERE activities.workspace_id IS NULL AND activities.user_id = w.personal_owner_id;
UPDATE github_installations SET workspace_id = w.id FROM workspaces w
WHERE github_installations.workspace_id IS NULL AND github_installations.user_id = w.personal_owner_id;
UPDATE github_repositories SET workspace_id = i.workspace_id FROM github_installations i
WHERE github_repositories.workspace_id IS NULL AND github_repositories.installation_id = i.id;
UPDATE github_connection_states SET workspace_id = w.id FROM workspaces w
WHERE github_connection_states.workspace_id IS NULL AND github_connection_states.user_id = w.personal_owner_id;
UPDATE notifications SET workspace_id = p.workspace_id FROM projects p
WHERE notifications.workspace_id IS NULL AND notifications.project_id = p.id;
UPDATE notifications SET workspace_id = w.id FROM workspaces w
WHERE notifications.workspace_id IS NULL AND notifications.user_id = w.personal_owner_id;
UPDATE ai_provider_credentials SET workspace_id = w.id FROM workspaces w
WHERE ai_provider_credentials.workspace_id IS NULL AND ai_provider_credentials.user_id = w.personal_owner_id;
UPDATE refresh_sessions SET workspace_id = w.id FROM workspaces w
WHERE refresh_sessions.workspace_id IS NULL AND refresh_sessions.user_id = w.personal_owner_id;

ALTER TABLE projects ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE tasks ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE activities ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE github_installations ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE github_repositories ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE github_connection_states ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE notifications ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE ai_provider_credentials ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE refresh_sessions ALTER COLUMN workspace_id SET NOT NULL;

CREATE UNIQUE INDEX github_installations_workspace_identity ON github_installations(id, workspace_id, user_id);
CREATE UNIQUE INDEX github_repositories_workspace_identity ON github_repositories(id, workspace_id);
ALTER TABLE github_repositories ADD CONSTRAINT github_repository_installation_workspace_fk
FOREIGN KEY (installation_id, workspace_id, user_id) REFERENCES github_installations(id, workspace_id, user_id);
ALTER TABLE notifications ADD CONSTRAINT notifications_project_workspace_fk
FOREIGN KEY (project_id, workspace_id) REFERENCES projects(id, workspace_id);

ALTER TABLE project_github_repositories ADD COLUMN workspace_id BIGINT;
UPDATE project_github_repositories SET workspace_id = p.workspace_id FROM projects p
WHERE project_github_repositories.project_id = p.id;
ALTER TABLE project_github_repositories ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE project_github_repositories ADD CONSTRAINT github_link_project_workspace_fk
FOREIGN KEY (project_id, workspace_id) REFERENCES projects(id, workspace_id);
ALTER TABLE project_github_repositories ADD CONSTRAINT github_link_repository_workspace_fk
FOREIGN KEY (repository_id, workspace_id) REFERENCES github_repositories(id, workspace_id);
