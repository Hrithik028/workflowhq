const { createHash, randomUUID } = require("node:crypto");

const { logActivity } = require("../lib/activity");
const { AppError } = require("../lib/errors");
const { parseJiraCsv } = require("../lib/jiraCsv");
const { getProjectRole } = require("../lib/projectAccess");
const { createTask } = require("../lib/taskMutationService");

const issuesHash = (issues) => createHash("sha256").update(JSON.stringify(issues)).digest("hex");

const requireProjectOwner = async (db, projectId, userId) => {
  if ((await getProjectRole(db, projectId, userId)) !== "owner") {
    throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");
  }
  const result = await db.query("SELECT id, key, archived_at FROM projects WHERE id = $1", [
    projectId
  ]);
  const project = result.rows[0];
  if (!project || project.archived_at) {
    throw new AppError(409, "PROJECT_UNAVAILABLE", "Restore this project before importing issues.");
  }
  return project;
};

const mappedKeys = async (db, siteUrl, keys) => {
  const result = await db.query(
    `SELECT jira_issue_key, project_id, task_id FROM jira_issue_mappings
     WHERE site_url = $1 AND jira_issue_key = ANY($2::text[])`,
    [siteUrl, keys]
  );
  return new Map(result.rows.map((row) => [row.jira_issue_key, row]));
};

const previewJiraImport = async (req, res) => {
  const db = req.app.locals.db;
  await requireProjectOwner(db, req.params.id, req.user.id);
  const { siteUrl, jiraProjectKey, csv } = req.body;
  const issues = parseJiraCsv(csv, jiraProjectKey);
  const existing = await mappedKeys(
    db,
    siteUrl,
    issues.map((issue) => issue.sourceKey)
  );
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  await db.query("DELETE FROM jira_import_previews WHERE expires_at < $1", [
    new Date(Date.now() - 24 * 60 * 60_000)
  ]);
  await db.query(
    `INSERT INTO jira_import_previews
       (id, project_id, user_id, site_url, jira_project_key, issues_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, req.params.id, req.user.id, siteUrl, jiraProjectKey, issuesHash(issues), expiresAt]
  );
  return res.status(200).json({
    data: {
      previewId: id,
      expiresAt: expiresAt.toISOString(),
      issues: issues.map((issue) => ({
        ...issue,
        alreadyImported: existing.has(issue.sourceKey),
        importedToThisProject:
          Number(existing.get(issue.sourceKey)?.project_id) === Number(req.params.id)
      }))
    }
  });
};

const applyJiraImport = async (req, res) => {
  const db = req.app.locals.db;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await requireProjectOwner(client, req.params.id, req.user.id);
    const result = await client.query(
      `SELECT * FROM jira_import_previews
       WHERE id = $1 AND project_id = $2 AND user_id = $3 FOR UPDATE`,
      [req.body.previewId, req.params.id, req.user.id]
    );
    const preview = result.rows[0];
    if (!preview || preview.applied_at || new Date(preview.expires_at).getTime() <= Date.now()) {
      throw new AppError(409, "JIRA_PREVIEW_EXPIRED", "Generate a fresh Jira import preview.");
    }
    const issues = parseJiraCsv(req.body.csv, preview.jira_project_key);
    if (issuesHash(issues) !== preview.issues_hash) {
      throw new AppError(
        409,
        "JIRA_PREVIEW_CHANGED",
        "The Jira export changed after preview. Review it again."
      );
    }
    const chosen = new Set(req.body.issueKeys);
    if (
      chosen.size !== req.body.issueKeys.length ||
      issues.some((issue) => chosen.has(issue.sourceKey)) === false ||
      [...chosen].some((key) => !issues.some((issue) => issue.sourceKey === key))
    ) {
      throw new AppError(400, "JIRA_SELECTION_INVALID", "Select issues from the reviewed preview.");
    }
    const existing = await mappedKeys(client, preview.site_url, [...chosen]);
    const imported = [];
    const skipped = [];
    for (const issue of issues) {
      if (!chosen.has(issue.sourceKey)) continue;
      if (existing.has(issue.sourceKey)) {
        skipped.push(issue.sourceKey);
        continue;
      }
      const task = await createTask(client, {
        userId: req.user.id,
        source: "jira_import",
        requirePermission: false,
        fields: {
          title: issue.title,
          description: issue.description,
          status: issue.status,
          priority: issue.priority,
          projectId: Number(req.params.id),
          taskType: issue.taskType,
          dueDate: issue.dueDate
        }
      });
      await client.query(
        `INSERT INTO jira_issue_mappings
           (site_url, jira_project_key, jira_issue_key, project_id, task_id, imported_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          preview.site_url,
          preview.jira_project_key,
          issue.sourceKey,
          req.params.id,
          task.id,
          req.user.id
        ]
      );
      imported.push({ sourceKey: issue.sourceKey, issueKey: task.issue_key, taskId: task.id });
    }
    await client.query(
      "UPDATE jira_import_previews SET applied_at = CURRENT_TIMESTAMP WHERE id = $1",
      [preview.id]
    );
    await logActivity(client, {
      userId: req.user.id,
      action: "jira_import_applied",
      entityType: "project",
      entityId: Number(req.params.id),
      entityTitle: preview.jira_project_key,
      details: {
        siteUrl: preview.site_url,
        importedCount: imported.length,
        skippedCount: skipped.length
      }
    });
    await client.query("COMMIT");
    return res.status(200).json({ data: { imported, skipped } });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") {
      throw new AppError(
        409,
        "JIRA_IMPORT_CONFLICT",
        "Another import added one of these issues. Preview again."
      );
    }
    throw error;
  } finally {
    client.release();
  }
};

module.exports = { applyJiraImport, previewJiraImport };
