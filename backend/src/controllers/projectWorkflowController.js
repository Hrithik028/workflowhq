const { logActivity } = require("../lib/activity");
const { AppError } = require("../lib/errors");
const { getProjectRole } = require("../lib/projectAccess");
const { WORKFLOW_TRIGGERS, ensureProjectWorkflowRules } = require("../lib/projectWorkflow");
const { selectProjectStatusWorkflow } = require("../lib/projectStatusWorkflow");

const mapRule = (row) => ({
  id: Number(row.id),
  trigger: row.trigger_name,
  enabled: row.enabled,
  fromStatus: row.from_status,
  toStatus: row.to_status,
  updatedAt: row.updated_at
});

const getProject = async (db, projectId, userId, ownerOnly = false) => {
  const role = await getProjectRole(db, projectId, userId);
  if (!role || (ownerOnly && role !== "owner")) {
    throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");
  }
  const project = (
    await db.query("SELECT id, key, name, archived_at FROM projects WHERE id = $1", [projectId])
  ).rows[0];
  if (!project) throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");
  if (project.archived_at) {
    throw new AppError(
      409,
      "PROJECT_ARCHIVED",
      "Restore this project before changing workflow rules."
    );
  }
  return project;
};

const selectRules = async (db, projectId) => {
  const result = await db.query(
    `SELECT id, trigger_name, enabled, from_status, to_status, updated_at
     FROM project_workflow_rules
     WHERE project_id = $1
     ORDER BY CASE trigger_name
       WHEN 'commit_pushed' THEN 1
       WHEN 'pull_request_opened' THEN 2
       WHEN 'pull_request_merged' THEN 3
       WHEN 'check_run_succeeded' THEN 4
       WHEN 'deployment_succeeded' THEN 5
       ELSE 99 END`,
    [projectId]
  );
  return result.rows.map(mapRule);
};

const getProjectWorkflow = async (req, res) => {
  const db = req.app.locals.db;
  const project = await getProject(db, req.params.id, req.user.id);
  const configuration = await selectProjectStatusWorkflow(db, project.id);
  return res.status(200).json({
    data: {
      project: { id: Number(project.id), key: project.key, name: project.name },
      rules: await selectRules(db, project.id),
      ...configuration
    }
  });
};

const updateProjectWorkflow = async (req, res) => {
  const db = req.app.locals.db;
  const project = await getProject(db, req.params.id, req.user.id, true);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await ensureProjectWorkflowRules(client, project.id, req.user.id);
    for (const rule of req.body.rules) {
      await client.query(
        `UPDATE project_workflow_rules
         SET enabled = $1, from_status = $2, to_status = $3,
             updated_by = $4, updated_at = CURRENT_TIMESTAMP
         WHERE project_id = $5 AND trigger_name = $6`,
        [rule.enabled, rule.fromStatus, rule.toStatus, req.user.id, project.id, rule.trigger]
      );
    }
    if (req.body.statuses) {
      for (const status of req.body.statuses) {
        await client.query(
          `UPDATE project_status_labels SET label = $1
           WHERE project_id = $2 AND status = $3`,
          [status.label, project.id, status.status]
        );
      }
      await client.query("DELETE FROM project_status_transitions WHERE project_id = $1", [
        project.id
      ]);
      for (const transition of req.body.transitions) {
        await client.query(
          `INSERT INTO project_status_transitions (project_id, from_status, to_status)
           VALUES ($1, $2, $3)`,
          [project.id, transition.fromStatus, transition.toStatus]
        );
      }
    }
    await logActivity(client, {
      userId: req.user.id,
      action: "project_workflow_updated",
      entityType: "project",
      entityId: Number(project.id),
      entityTitle: project.name,
      details: {
        enabledTriggers: req.body.rules.filter((rule) => rule.enabled).map((rule) => rule.trigger),
        ruleCount: WORKFLOW_TRIGGERS.length,
        ...(req.body.statuses ? { statusConfigurationChanged: true } : {})
      }
    });
    await client.query("COMMIT");
    return res.status(200).json({
      data: {
        project: { id: Number(project.id), key: project.key, name: project.name },
        rules: await selectRules(db, project.id),
        ...(await selectProjectStatusWorkflow(db, project.id))
      }
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

module.exports = { getProjectWorkflow, updateProjectWorkflow };
