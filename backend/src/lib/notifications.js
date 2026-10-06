const { currentWorkspace } = require("./workspaceContext");
const { ensurePersonalWorkspace } = require("./personalWorkspace");
const notifyUser = async (
  db,
  { userId, actorId, projectId = null, taskId = null, kind, title, body, dedupeKey = null }
) => {
  if (!userId || Number(userId) === Number(actorId)) return;
  const workspaceId = projectId
    ? (await db.query("SELECT workspace_id FROM projects WHERE id = $1", [projectId])).rows[0]
        ?.workspace_id
    : currentWorkspace() || (await ensurePersonalWorkspace(db, { id: userId }));
  if (projectId) {
    const membership = await db.query(
      "SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2",
      [projectId, userId]
    );
    if (!membership.rows[0]) return;
  }
  await db.query(
    `INSERT INTO notifications
       (user_id, actor_id, project_id, task_id, kind, title, body, dedupe_key, workspace_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (user_id, dedupe_key) DO NOTHING`,
    [userId, actorId, projectId, taskId, kind, title, body, dedupeKey, workspaceId]
  );
};

module.exports = { notifyUser };
