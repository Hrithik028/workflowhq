CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  kind VARCHAR(30) NOT NULL CHECK (kind IN ('task_assigned', 'task_commented', 'project_added')),
  title VARCHAR(200) NOT NULL,
  body VARCHAR(500) NOT NULL,
  dedupe_key VARCHAR(160),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedupe
  ON notifications (user_id, dedupe_key);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient
  ON notifications (user_id, created_at DESC, id DESC);
