CREATE TABLE IF NOT EXISTS task_dependencies (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  blocker_task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  blocked_task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (blocker_task_id, blocked_task_id),
  CHECK (blocker_task_id <> blocked_task_id)
);

CREATE INDEX IF NOT EXISTS task_dependencies_project_idx
  ON task_dependencies (project_id, blocked_task_id);

CREATE INDEX IF NOT EXISTS task_dependencies_blocker_idx
  ON task_dependencies (blocker_task_id);
