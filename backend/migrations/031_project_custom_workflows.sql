CREATE TABLE IF NOT EXISTS project_status_labels (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status VARCHAR(30) NOT NULL CHECK (status IN ('todo', 'in_progress', 'completed')),
  label VARCHAR(40) NOT NULL,
  PRIMARY KEY (project_id, status)
);

CREATE TABLE IF NOT EXISTS project_status_transitions (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  from_status VARCHAR(30) NOT NULL CHECK (from_status IN ('todo', 'in_progress', 'completed')),
  to_status VARCHAR(30) NOT NULL CHECK (to_status IN ('todo', 'in_progress', 'completed')),
  PRIMARY KEY (project_id, from_status, to_status),
  CHECK (from_status <> to_status)
);

INSERT INTO project_status_labels (project_id, status, label)
SELECT id, 'todo', 'Backlog' FROM projects ON CONFLICT DO NOTHING;
INSERT INTO project_status_labels (project_id, status, label)
SELECT id, 'in_progress', 'In progress' FROM projects ON CONFLICT DO NOTHING;
INSERT INTO project_status_labels (project_id, status, label)
SELECT id, 'completed', 'Released' FROM projects ON CONFLICT DO NOTHING;

INSERT INTO project_status_transitions (project_id, from_status, to_status)
SELECT id, 'todo', 'in_progress' FROM projects ON CONFLICT DO NOTHING;
INSERT INTO project_status_transitions (project_id, from_status, to_status)
SELECT id, 'todo', 'completed' FROM projects ON CONFLICT DO NOTHING;
INSERT INTO project_status_transitions (project_id, from_status, to_status)
SELECT id, 'in_progress', 'todo' FROM projects ON CONFLICT DO NOTHING;
INSERT INTO project_status_transitions (project_id, from_status, to_status)
SELECT id, 'in_progress', 'completed' FROM projects ON CONFLICT DO NOTHING;
INSERT INTO project_status_transitions (project_id, from_status, to_status)
SELECT id, 'completed', 'todo' FROM projects ON CONFLICT DO NOTHING;
INSERT INTO project_status_transitions (project_id, from_status, to_status)
SELECT id, 'completed', 'in_progress' FROM projects ON CONFLICT DO NOTHING;
