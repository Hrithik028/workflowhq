CREATE TABLE IF NOT EXISTS user_permissions (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_key VARCHAR(80) NOT NULL,
  allowed BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, permission_key)
);

CREATE TABLE IF NOT EXISTS workspace_rules (
  rule_key VARCHAR(80) PRIMARY KEY,
  rule_value JSONB NOT NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id BIGSERIAL PRIMARY KEY,
  admin_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  target_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(80) NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_permissions_user
  ON user_permissions(user_id);

CREATE INDEX IF NOT EXISTS idx_admin_audit_created
  ON admin_audit_log(created_at DESC);

INSERT INTO workspace_rules (rule_key, rule_value)
VALUES
  ('allow_task_deletion', 'true'::jsonb),
  ('allow_project_deletion', 'true'::jsonb),
  ('require_due_date_for_high_priority', 'false'::jsonb),
  ('max_open_tasks_per_user', '100'::jsonb)
ON CONFLICT (rule_key) DO NOTHING;
