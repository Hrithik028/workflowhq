CREATE TABLE IF NOT EXISTS project_invitations (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('editor', 'viewer')),
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'revoked', 'expired')),
  invited_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  accepted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  responded_at TIMESTAMPTZ,
  delivery_status VARCHAR(30) NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending', 'sent', 'failed', 'not_configured')),
  last_delivery_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_invitations_pending_email
  ON project_invitations(project_id, email)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_project_invitations_recipient
  ON project_invitations(email, status, expires_at);

CREATE INDEX IF NOT EXISTS idx_project_invitations_project
  ON project_invitations(project_id, status, created_at DESC);
