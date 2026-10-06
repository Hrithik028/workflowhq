const { AsyncLocalStorage } = require("node:async_hooks");
const { AppError } = require("./errors");

const storage = new AsyncLocalStorage();
const currentWorkspace = () => storage.getStore()?.workspaceId || null;
const runInWorkspace = (workspaceId, callback) => storage.run({ workspaceId }, callback);

// Callers explicitly mark where the workspace predicate belongs. Never infer
// SQL ownership from table names or rewrite arbitrary SQL.
const queryInWorkspace = (db, sql, values, alias) => {
  if (!sql.includes("/* workspace */"))
    throw new Error("Workspace query must declare its scope predicate.");
  const workspaceId = currentWorkspace();
  const predicate = workspaceId ? `AND ${alias}.workspace_id = $${values.length + 1}` : "";
  return db.query(
    sql.replace("/* workspace */", predicate),
    workspaceId ? [...values, workspaceId] : values
  );
};

const assertProjectWorkspace = async (db, projectId) => {
  const workspaceId = currentWorkspace();
  if (!workspaceId) return;
  const result = await db.query("SELECT id FROM projects WHERE id = $1 AND workspace_id = $2", [
    projectId,
    workspaceId
  ]);
  if (!result.rows[0]) throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");
};

module.exports = { assertProjectWorkspace, currentWorkspace, queryInWorkspace, runInWorkspace };
