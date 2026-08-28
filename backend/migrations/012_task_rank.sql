ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS rank DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS idx_tasks_rank ON tasks(project_id, rank);
