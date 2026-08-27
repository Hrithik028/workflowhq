ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS start_date DATE;

CREATE INDEX IF NOT EXISTS idx_tasks_user_start_date
  ON tasks(user_id, start_date)
  WHERE start_date IS NOT NULL;
