const { logActivity } = require("./activity");

const WORKFLOW_TRIGGERS = [
  "commit_pushed",
  "pull_request_opened",
  "pull_request_merged",
  "check_run_succeeded",
  "deployment_succeeded"
];

const DEFAULT_WORKFLOW_RULES = [
  { trigger: "commit_pushed", enabled: true, fromStatus: "todo", toStatus: "in_progress" },
  {
    trigger: "pull_request_opened",
    enabled: true,
    fromStatus: "todo",
    toStatus: "in_progress"
  },
  {
    trigger: "pull_request_merged",
    enabled: true,
    fromStatus: "in_progress",
    toStatus: "completed"
  },
  {
    trigger: "check_run_succeeded",
    enabled: false,
    fromStatus: "in_progress",
    toStatus: "completed"
  },
  {
    trigger: "deployment_succeeded",
    enabled: false,
    fromStatus: "in_progress",
    toStatus: "completed"
  }
];

const ensureProjectWorkflowRules = async (db, projectId, userId) => {
  for (const rule of DEFAULT_WORKFLOW_RULES) {
    await db.query(
      `INSERT INTO project_workflow_rules
         (project_id, trigger_name, enabled, from_status, to_status, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $6)
       ON CONFLICT (project_id, trigger_name) DO NOTHING`,
      [projectId, rule.trigger, rule.enabled, rule.fromStatus, rule.toStatus, userId]
    );
  }
};

const workflowTriggerFor = (eventName, payload, item) => {
  if (eventName === "push" && item.linkType === "commit") return "commit_pushed";
  if (eventName === "pull_request" && item.linkType === "pull_request") {
    if (item.state === "merged") return "pull_request_merged";
    if (["opened", "reopened", "ready_for_review"].includes(payload.action) || item.state === "open") {
      return "pull_request_opened";
    }
  }
  if (eventName === "check_run" && item.state === "success") return "check_run_succeeded";
  if (eventName === "deployment_status" && item.state === "success") {
    return "deployment_succeeded";
  }
  return null;
};

const applyProjectWorkflowAutomation = async ({
  client,
  repository,
  eventId,
  item,
  tasks
}) => {
  if (!item.workflowTrigger || !tasks.length) return [];
  const appliedTaskIds = [];

  for (const task of tasks) {
    const rule = (
      await client.query(
        `SELECT workflow.id, workflow.from_status, workflow.to_status
         FROM project_workflow_rules workflow
         JOIN projects project ON project.id = workflow.project_id
         WHERE workflow.project_id = $1 AND workflow.trigger_name = $2
           AND workflow.enabled = TRUE AND project.archived_at IS NULL`,
        [task.project_id, item.workflowTrigger]
      )
    ).rows[0];
    if (!rule) continue;

    const run = (
      await client.query(
        `INSERT INTO task_workflow_automation_runs
           (project_id, task_id, event_id, rule_id, trigger_name, from_status, to_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (task_id, event_id, trigger_name) DO NOTHING
         RETURNING id`,
        [
          task.project_id,
          task.id,
          eventId,
          rule.id,
          item.workflowTrigger,
          rule.from_status,
          rule.to_status
        ]
      )
    ).rows[0];
    if (!run) continue;

    const updated = (
      await client.query(
        `UPDATE tasks
         SET status = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND project_id = $3 AND status = $4 AND archived_at IS NULL
         RETURNING id, title`,
        [rule.to_status, task.id, task.project_id, rule.from_status]
      )
    ).rows[0];
    await client.query(
      "UPDATE task_workflow_automation_runs SET outcome = $1 WHERE id = $2",
      [updated ? "applied" : "skipped", run.id]
    );
    if (!updated) continue;

    appliedTaskIds.push(Number(updated.id));
    let activityUserId = repository.user_id;
    if (item.actorLogin) {
      const mappedActor = (
        await client.query(
          `SELECT mapping.mapped_user_id
           FROM github_identity_mappings mapping
           JOIN project_members membership
             ON membership.user_id = mapping.mapped_user_id
            AND membership.project_id = $3
           WHERE mapping.installation_id = $1
             AND mapping.github_login_normalized = LOWER($2)
           LIMIT 1`,
          [repository.installation_id, item.actorLogin, task.project_id]
        )
      ).rows[0];
      if (mappedActor) activityUserId = mappedActor.mapped_user_id;
    }
    await logActivity(client, {
      userId: activityUserId,
      action: "task_workflow_automated",
      entityType: "task",
      entityId: Number(updated.id),
      entityTitle: updated.title,
      details: {
        source: "github",
        trigger: item.workflowTrigger,
        from: rule.from_status,
        to: rule.to_status,
        eventId: Number(eventId),
        repository: repository.full_name,
        actor: item.actorLogin
      }
    });
  }
  return appliedTaskIds;
};

module.exports = {
  DEFAULT_WORKFLOW_RULES,
  WORKFLOW_TRIGGERS,
  applyProjectWorkflowAutomation,
  ensureProjectWorkflowRules,
  workflowTriggerFor
};
