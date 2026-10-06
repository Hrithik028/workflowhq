const { currentWorkspace } = require("./workspaceContext");
const { ensurePersonalWorkspace } = require("./personalWorkspace");
const logActivity = async (
  db,
  { userId, action, entityType, entityId = null, entityTitle, details = {} }
) => {
  let workspaceId = currentWorkspace();
  if (entityId && ["task", "project"].includes(entityType)) {
    workspaceId = (
      await db.query(
        `SELECT workspace_id FROM ${entityType === "task" ? "tasks" : "projects"} WHERE id = $1`,
        [entityId]
      )
    ).rows[0]?.workspace_id;
  }
  if (!workspaceId) workspaceId = await ensurePersonalWorkspace(db, { id: userId });
  await db.query(
    `INSERT INTO activities (user_id, action, entity_type, entity_id, entity_title, details, workspace_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [userId, action, entityType, entityId, entityTitle, JSON.stringify(details), workspaceId]
  );
};

module.exports = { logActivity };
