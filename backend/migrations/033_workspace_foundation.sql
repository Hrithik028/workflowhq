CREATE TABLE workspaces (
  id BIGSERIAL PRIMARY KEY,
  slug VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  personal_owner_id INTEGER UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE workspace_members (
  workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  source VARCHAR(20) NOT NULL CHECK (source IN ('personal', 'project', 'direct')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX workspace_members_user_idx ON workspace_members(user_id, workspace_id);

INSERT INTO workspaces (slug, name, created_by, personal_owner_id)
SELECT 'personal-' || id::text, name || '''s workspace', id, id
FROM users
ON CONFLICT (personal_owner_id) DO NOTHING;

INSERT INTO workspace_members (workspace_id, user_id, role, source)
SELECT id, personal_owner_id, 'owner', 'personal'
FROM workspaces
WHERE personal_owner_id IS NOT NULL
ON CONFLICT (workspace_id, user_id) DO NOTHING;

-- Existing project collaborators also need workspace membership, but retain
-- their narrower project roles. No collaborator is promoted to workspace admin.
INSERT INTO workspace_members (workspace_id, user_id, role, source)
SELECT w.id, pm.user_id, 'member', 'project'
FROM projects p
JOIN workspaces w ON w.personal_owner_id = p.user_id
JOIN project_members pm ON pm.project_id = p.id
WHERE pm.user_id <> p.user_id
ON CONFLICT (workspace_id, user_id) DO NOTHING;

ALTER TABLE projects ADD COLUMN workspace_id BIGINT REFERENCES workspaces(id);

UPDATE projects
SET workspace_id = workspaces.id
FROM workspaces
WHERE projects.user_id = workspaces.personal_owner_id;

CREATE INDEX projects_workspace_idx ON projects(workspace_id, id);
