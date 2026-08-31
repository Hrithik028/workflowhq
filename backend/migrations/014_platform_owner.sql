ALTER TABLE users
  ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 0;

ALTER TABLE users
  ADD CONSTRAINT users_role_allowed
  CHECK (role IN ('user', 'admin', 'platform_owner'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_single_platform_owner
  ON users (role)
  WHERE role = 'platform_owner';
