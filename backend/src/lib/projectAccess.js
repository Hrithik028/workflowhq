const getProjectRole = async (db, projectId, userId) => {
  if (!projectId) return null;
  const result = await db.query(
    "SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2",
    [projectId, userId]
  );
  return result.rows[0]?.role || null;
};

const canAccessTask = async (db, task, userId) => {
  if (!task.project_id) return Number(task.user_id) === Number(userId);
  return (await getProjectRole(db, task.project_id, userId)) !== null;
};

module.exports = { canAccessTask, getProjectRole };
