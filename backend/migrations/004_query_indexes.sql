CREATE INDEX IF NOT EXISTS idx_tasks_user_updated
  ON tasks(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_tasks_user_status
  ON tasks(user_id, status);

CREATE INDEX IF NOT EXISTS idx_tasks_user_priority
  ON tasks(user_id, priority);

CREATE INDEX IF NOT EXISTS idx_tasks_user_due_date
  ON tasks(user_id, due_date)
  WHERE due_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_project
  ON tasks(project_id)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_projects_user_updated
  ON projects(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_activities_user_created
  ON activities(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_refresh_sessions_expires
  ON refresh_sessions(expires_at);
