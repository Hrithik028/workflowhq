CREATE TABLE IF NOT EXISTS project_workflow_rules (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  trigger_name VARCHAR(40) NOT NULL
    CHECK (trigger_name IN (
      'commit_pushed',
      'pull_request_opened',
      'pull_request_merged',
      'check_run_succeeded',
      'deployment_succeeded'
    )),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  from_status VARCHAR(30) NOT NULL
    CHECK (from_status IN ('todo', 'in_progress', 'completed')),
  to_status VARCHAR(30) NOT NULL
    CHECK (to_status IN ('todo', 'in_progress', 'completed')),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (project_id, trigger_name),
  CHECK (from_status <> to_status)
);

CREATE TABLE IF NOT EXISTS task_workflow_automation_runs (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  event_id INTEGER NOT NULL REFERENCES github_development_events(id) ON DELETE CASCADE,
  rule_id INTEGER NOT NULL REFERENCES project_workflow_rules(id) ON DELETE CASCADE,
  trigger_name VARCHAR(40) NOT NULL,
  from_status VARCHAR(30) NOT NULL,
  to_status VARCHAR(30) NOT NULL,
  outcome VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (outcome IN ('pending', 'applied', 'skipped')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (task_id, event_id, trigger_name)
);

CREATE INDEX IF NOT EXISTS idx_project_workflow_rules_project
  ON project_workflow_rules(project_id, enabled, trigger_name);

CREATE INDEX IF NOT EXISTS idx_task_workflow_automation_runs_task
  ON task_workflow_automation_runs(task_id, created_at DESC);

INSERT INTO project_workflow_rules
  (project_id, trigger_name, enabled, from_status, to_status, created_by, updated_by)
SELECT id, 'commit_pushed', TRUE, 'todo', 'in_progress', user_id, user_id
FROM projects
ON CONFLICT (project_id, trigger_name) DO NOTHING;

INSERT INTO project_workflow_rules
  (project_id, trigger_name, enabled, from_status, to_status, created_by, updated_by)
SELECT id, 'pull_request_opened', TRUE, 'todo', 'in_progress', user_id, user_id
FROM projects
ON CONFLICT (project_id, trigger_name) DO NOTHING;

INSERT INTO project_workflow_rules
  (project_id, trigger_name, enabled, from_status, to_status, created_by, updated_by)
SELECT id, 'pull_request_merged', TRUE, 'in_progress', 'completed', user_id, user_id
FROM projects
ON CONFLICT (project_id, trigger_name) DO NOTHING;

INSERT INTO project_workflow_rules
  (project_id, trigger_name, enabled, from_status, to_status, created_by, updated_by)
SELECT id, 'check_run_succeeded', FALSE, 'in_progress', 'completed', user_id, user_id
FROM projects
ON CONFLICT (project_id, trigger_name) DO NOTHING;

INSERT INTO project_workflow_rules
  (project_id, trigger_name, enabled, from_status, to_status, created_by, updated_by)
SELECT id, 'deployment_succeeded', FALSE, 'in_progress', 'completed', user_id, user_id
FROM projects
ON CONFLICT (project_id, trigger_name) DO NOTHING;
