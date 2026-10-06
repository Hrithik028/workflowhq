const { currentWorkspace } = require("./workspaceContext");
const getProjectRole = async (db, projectId, userId) => {
  if (!projectId) return null;
  const workspaceId = currentWorkspace();
  const result = await db.query(
    `SELECT pm.role FROM project_members pm JOIN projects p ON p.id = pm.project_id
     WHERE pm.project_id = $1 AND pm.user_id = $2 ${workspaceId ? "AND p.workspace_id = $3" : ""}`,
    workspaceId ? [projectId, userId, workspaceId] : [projectId, userId]
  );
  return result.rows[0]?.role || null;
};

const canAccessTask = async (db, task, userId) => {
  if (!task.project_id)
    return (
      Number(task.user_id) === Number(userId) &&
      (!currentWorkspace() || Number(task.workspace_id) === Number(currentWorkspace()))
    );
  return (await getProjectRole(db, task.project_id, userId)) !== null;
};

module.exports = { canAccessTask, getProjectRole };
