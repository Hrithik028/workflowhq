const ensurePersonalWorkspace = async (db, user) => {
  const userId = Number(user.id);
  const name =
    user.name || (await db.query("SELECT name FROM users WHERE id = $1", [userId])).rows[0]?.name;
  await db.query(
    `INSERT INTO workspaces (slug, name, created_by, personal_owner_id)
     VALUES ($1, $2, $3, $3)
     ON CONFLICT (personal_owner_id) DO NOTHING`,
    [`personal-${userId}`, `${name}'s workspace`, userId]
  );
  const result = await db.query("SELECT id FROM workspaces WHERE personal_owner_id = $1", [userId]);
  const workspaceId = Number(result.rows[0].id);
  await db.query(
    `INSERT INTO workspace_members (workspace_id, user_id, role, source)
     VALUES ($1, $2, 'owner', 'personal')
     ON CONFLICT (workspace_id, user_id) DO NOTHING`,
    [workspaceId, userId]
  );
  return workspaceId;
};

module.exports = { ensurePersonalWorkspace };
