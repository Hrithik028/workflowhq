ALTER TABLE projects
  ADD COLUMN key VARCHAR(10);

UPDATE projects
SET key = 'P' || id::text
WHERE key IS NULL;

ALTER TABLE projects
  ALTER COLUMN key SET NOT NULL;

CREATE UNIQUE INDEX uq_projects_user_key
  ON projects(user_id, key);

ALTER TABLE tasks
  ADD COLUMN issue_key VARCHAR(32),
  ADD COLUMN task_type VARCHAR(20) NOT NULL DEFAULT 'task',
  ADD COLUMN parent_task_id INTEGER REFERENCES tasks(id) ON DELETE RESTRICT,
  ADD CONSTRAINT tasks_task_type_check
    CHECK (task_type IN ('initiative', 'epic', 'story', 'task', 'bug', 'subtask'));

UPDATE tasks
SET issue_key = projects.key || '-' || tasks.id::text
FROM projects
WHERE tasks.project_id = projects.id
  AND tasks.issue_key IS NULL;

UPDATE tasks
SET issue_key = 'INB-' || id::text
WHERE project_id IS NULL
  AND issue_key IS NULL;

CREATE UNIQUE INDEX uq_tasks_user_issue_key
  ON tasks(user_id, issue_key);

CREATE INDEX idx_tasks_user_parent
  ON tasks(user_id, parent_task_id);

CREATE INDEX idx_tasks_project_parent
  ON tasks(project_id, parent_task_id)
  WHERE project_id IS NOT NULL;
