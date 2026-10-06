const addProjectCollaboratorToWorkspace = async (db, projectId, userId) => {
  const result = await db.query("SELECT workspace_id FROM projects WHERE id = $1", [projectId]);
  const workspaceId = result.rows[0]?.workspace_id;
  if (!workspaceId) return;
  await db.query(
    `INSERT INTO workspace_members (workspace_id, user_id, role, source)
     VALUES ($1, $2, 'member', 'project')
     ON CONFLICT (workspace_id, user_id) DO NOTHING`,
    [workspaceId, userId]
  );
};

const releaseProjectCollaboratorFromWorkspace = async (db, projectId, userId) => {
  const project = await db.query("SELECT workspace_id FROM projects WHERE id = $1", [projectId]);
  const workspaceId = project.rows[0]?.workspace_id;
  if (!workspaceId) return;
  const remaining = await db.query(
    `SELECT COUNT(*)::int AS count FROM project_members pm
     JOIN projects p ON p.id = pm.project_id
     WHERE p.workspace_id = $1 AND pm.user_id = $2`,
    [workspaceId, userId]
  );
  if (Number(remaining.rows[0].count) > 0) return;
  await db.query(
    `DELETE FROM workspace_members
     WHERE workspace_id = $1 AND user_id = $2 AND source = 'project'`,
    [workspaceId, userId]
  );
};

const releaseOrphanedWorkspaceMembers = async (db, workspaceId) => {
  if (!workspaceId) return;
  const result = await db.query(
    `SELECT user_id FROM workspace_members
     WHERE workspace_id = $1 AND source = 'project'`,
    [workspaceId]
  );
  for (const { user_id: userId } of result.rows) {
    const remaining = await db.query(
      `SELECT COUNT(*)::int AS count FROM project_members pm
       JOIN projects p ON p.id = pm.project_id
       WHERE p.workspace_id = $1 AND pm.user_id = $2`,
      [workspaceId, userId]
    );
    if (Number(remaining.rows[0].count) === 0) {
      await db.query(
        "DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 AND source = 'project'",
        [workspaceId, userId]
      );
    }
  }
};

module.exports = {
  addProjectCollaboratorToWorkspace,
  releaseOrphanedWorkspaceMembers,
  releaseProjectCollaboratorFromWorkspace
};
