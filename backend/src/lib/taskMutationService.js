const { readCurrentAccess, readWorkspaceRules } = require("./accessControl");
const { logActivity } = require("./activity");
const { AppError } = require("./errors");
const { notifyUser } = require("./notifications");
const { canAccessTask, getProjectRole } = require("./projectAccess");
const { assertManualTransition, resolveWorkflowStage } = require("./projectStatusWorkflow");
const {
  assertProjectWorkspace,
  currentWorkspace,
  queryInWorkspace
} = require("./workspaceContext");
const { ensurePersonalWorkspace } = require("./personalWorkspace");

const typeRank = {
  initiative: 5,
  epic: 4,
  story: 3,
  task: 2,
  bug: 2,
  subtask: 1
};

const criterionFields =
  "id, task_id, body, completed, position, created_by, created_at, updated_at";

const assertPermission = async (db, userId, permissionKey) => {
  const access = await readCurrentAccess(db, userId);
  if (
    access.role !== "admin" &&
    access.role !== "platform_owner" &&
    access.permissions[permissionKey] !== true
  ) {
    throw new AppError(403, "PERMISSION_DENIED", `Your role cannot perform ${permissionKey}.`);
  }
};

const verifyProjectAccess = async (db, projectId, userId, allowedRoles) => {
  if (!projectId) return { key: "INB", role: null };
  await assertProjectWorkspace(db, projectId);
  const result = await db.query(
    `SELECT p.key, p.archived_at, pm.role
     FROM projects p
     LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $2
     WHERE p.id = $1`,
    [projectId, userId]
  );
  const project = result.rows[0];
  if (!project?.role || !allowedRoles.includes(project.role)) {
    throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");
  }
  if (project.archived_at) {
    throw new AppError(409, "PROJECT_ARCHIVED", "Restore this project before changing its work.");
  }
  return { key: project.key, role: project.role };
};

const validateAssignee = async (db, projectId, assigneeId) => {
  if (!assigneeId) return;
  if (!projectId || !(await getProjectRole(db, projectId, assigneeId))) {
    throw new AppError(
      422,
      "ASSIGNEE_NOT_A_MEMBER",
      projectId
        ? "The assignee must be a member of this project."
        : "Only shared project tickets can be assigned to someone else."
    );
  }
};

const validateSprint = async (db, projectId, sprintId) => {
  if (!sprintId) return;
  if (!projectId) {
    throw new AppError(
      422,
      "SPRINT_NOT_IN_PROJECT",
      "Only shared project tickets can join a sprint."
    );
  }
  const result = await db.query("SELECT id FROM sprints WHERE id = $1 AND project_id = $2", [
    sprintId,
    projectId
  ]);
  if (!result.rows[0]) {
    throw new AppError(
      422,
      "SPRINT_NOT_IN_PROJECT",
      "The sprint must belong to this task's project."
    );
  }
};

const verifyParentHierarchy = async ({ db, parentId, projectId, taskType, userId, taskId }) => {
  if (!parentId) return;
  let cursorId = parentId;
  let depth = 0;
  let parent;

  while (cursorId) {
    const result = await db.query(
      `SELECT id, project_id, parent_task_id, task_type, user_id, workspace_id, archived_at
       FROM tasks WHERE id = $1 FOR UPDATE`,
      [cursorId]
    );
    if (!result.rows[0] || !(await canAccessTask(db, result.rows[0], userId))) {
      throw new AppError(404, "PARENT_TASK_NOT_FOUND", "Parent task not found.");
    }
    const current = result.rows[0];
    if (current.archived_at) {
      throw new AppError(409, "PARENT_TASK_ARCHIVED", "Restore the parent task before using it.");
    }
    if (!parent) parent = current;
    if (taskId && Number(current.id) === Number(taskId)) {
      throw new AppError(409, "TASK_HIERARCHY_CYCLE", "A task cannot become its own ancestor.");
    }
    depth += 1;
    if (depth >= 5) {
      throw new AppError(409, "TASK_HIERARCHY_DEPTH", "Task hierarchy is limited to five levels.");
    }
    cursorId = current.parent_task_id;
  }

  if (Number(parent.project_id || 0) !== Number(projectId || 0)) {
    throw new AppError(
      409,
      "TASK_PROJECT_MISMATCH",
      "Parent and child tasks must belong to the same project."
    );
  }
  if (typeRank[parent.task_type] <= typeRank[taskType]) {
    throw new AppError(
      409,
      "INVALID_TASK_HIERARCHY",
      `${parent.task_type} tickets can only contain lower-level work.`
    );
  }
};

const loadTaskForMutation = async (
  db,
  { taskId, userId, expectedVersion, allowArchived = false }
) => {
  const result = await db.query("SELECT * FROM tasks WHERE id = $1 FOR UPDATE", [taskId]);
  const task = result.rows[0];
  if (!task || !(await canAccessTask(db, task, userId))) {
    throw new AppError(404, "TASK_NOT_FOUND", "Task not found.");
  }
  if (!allowArchived && task.archived_at) {
    throw new AppError(409, "TASK_ARCHIVED", "Restore this task before editing it.");
  }
  if (expectedVersion != null && Number(task.version) !== Number(expectedVersion)) {
    throw new AppError(
      409,
      "TASK_VERSION_CONFLICT",
      "This ticket changed after the plan was reviewed. Generate a new preview."
    );
  }
  return task;
};

const enforceTaskRules = async (db, { userId, fields, creating = false }) => {
  const dateKey = (value) =>
    value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
  if (fields.startDate && fields.dueDate && dateKey(fields.startDate) > dateKey(fields.dueDate)) {
    throw new AppError(
      422,
      "TASK_DATE_RANGE_INVALID",
      "Start date must be on or before the due date."
    );
  }
  const rules = await readWorkspaceRules(db);
  if (
    rules.require_due_date_for_high_priority === true &&
    fields.priority === "high" &&
    !fields.dueDate
  ) {
    throw new AppError(
      422,
      "HIGH_PRIORITY_DUE_DATE_REQUIRED",
      "High-priority work requires a due date under the current workspace rules."
    );
  }
  if (creating && fields.status !== "completed") {
    const limit = Number(rules.max_open_tasks_per_user || 100);
    const open = await queryInWorkspace(
      db,
      "SELECT COUNT(*)::int AS count FROM tasks t WHERE user_id = $1 AND status <> 'completed' AND archived_at IS NULL /* workspace */",
      [userId],
      "t"
    );
    if (Number(open.rows[0].count) >= limit) {
      throw new AppError(
        409,
        "OPEN_TASK_LIMIT_REACHED",
        `This workspace allows ${limit} open tasks per user.`
      );
    }
  }
};

const createTask = async (
  db,
  { userId, fields, source = "manual", evidenceIds = [], requirePermission = true }
) => {
  if (requirePermission) await assertPermission(db, userId, "tasks.create");
  const normalized = {
    title: fields.title,
    description: fields.description || "",
    status: fields.status || "todo",
    priority: fields.priority || "medium",
    startDate: fields.startDate || null,
    dueDate: fields.dueDate || null,
    projectId: fields.projectId || null,
    taskType: fields.taskType || "task",
    parentId: fields.parentId || null,
    assigneeId: fields.assigneeId || null,
    sprintId: fields.sprintId || null
  };
  await enforceTaskRules(db, { userId, fields: normalized, creating: true });
  const project = await verifyProjectAccess(db, normalized.projectId, userId, ["owner", "editor"]);
  if (normalized.projectId)
    await db.query("SELECT id FROM projects WHERE id=$1 FOR UPDATE", [normalized.projectId]);
  const stage = await resolveWorkflowStage(
    db,
    normalized.projectId,
    fields.workflowStage,
    normalized.status
  );
  await verifyParentHierarchy({
    db,
    parentId: normalized.parentId,
    projectId: normalized.projectId,
    taskType: normalized.taskType,
    userId
  });
  await validateAssignee(db, normalized.projectId, normalized.assigneeId);
  await validateSprint(db, normalized.projectId, normalized.sprintId);
  const inserted = await db.query(
    `INSERT INTO tasks
       (user_id, project_id, title, description, status, priority, start_date, due_date,
        task_type, parent_task_id, assignee_id, sprint_id, workspace_id, workflow_stage)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING *`,
    [
      userId,
      normalized.projectId,
      normalized.title,
      normalized.description,
      normalized.status,
      normalized.priority,
      normalized.startDate,
      normalized.dueDate,
      normalized.taskType,
      normalized.parentId,
      normalized.assigneeId,
      normalized.sprintId,
      currentWorkspace() ||
        (normalized.projectId
          ? (
              await db.query("SELECT workspace_id FROM projects WHERE id = $1", [
                normalized.projectId
              ])
            ).rows[0]?.workspace_id
          : await ensurePersonalWorkspace(db, { id: userId })),
      stage.stage
    ]
  );
  const task = inserted.rows[0];
  task.issue_key = `${project.key}-${task.id}`;
  await db.query("UPDATE tasks SET issue_key = $1 WHERE id = $2", [task.issue_key, task.id]);
  await logActivity(db, {
    userId,
    action: "task_created",
    entityType: "task",
    entityId: task.id,
    entityTitle: task.title,
    details: {
      issueKey: task.issue_key,
      taskType: task.task_type,
      parentId: task.parent_task_id,
      ...(source === "manual" ? {} : { source, evidenceIds })
    }
  });
  await notifyUser(db, {
    userId: task.assignee_id,
    actorId: userId,
    projectId: task.project_id,
    taskId: task.id,
    kind: "task_assigned",
    title: `Assigned to ${task.issue_key}`,
    body: task.title,
    dedupeKey: `task-assigned:${task.id}:${task.version}`
  });
  return task;
};

const valueOrExisting = (fields, key, existingKey) =>
  Object.prototype.hasOwnProperty.call(fields, key) ? fields[key] : fields.__existing[existingKey];

const updateTask = async (
  db,
  { userId, taskId, expectedVersion, fields, source = "manual", requirePermission = true }
) => {
  if (requirePermission) await assertPermission(db, userId, "tasks.edit");
  const existing = await loadTaskForMutation(db, { taskId, userId, expectedVersion });
  const values = { ...fields, __existing: existing };
  const normalized = {
    projectId: valueOrExisting(values, "projectId", "project_id"),
    title: valueOrExisting(values, "title", "title"),
    description: valueOrExisting(values, "description", "description"),
    status: valueOrExisting(values, "status", "status"),
    priority: valueOrExisting(values, "priority", "priority"),
    startDate: valueOrExisting(values, "startDate", "start_date"),
    dueDate: valueOrExisting(values, "dueDate", "due_date"),
    taskType: valueOrExisting(values, "taskType", "task_type"),
    parentId: valueOrExisting(values, "parentId", "parent_task_id"),
    assigneeId: valueOrExisting(values, "assigneeId", "assignee_id"),
    sprintId: valueOrExisting(values, "sprintId", "sprint_id")
  };
  await enforceTaskRules(db, { userId, fields: normalized });
  const projectChanged = Number(existing.project_id || 0) !== Number(normalized.projectId || 0);
  await verifyProjectAccess(db, normalized.projectId, userId, ["owner", "editor"]);
  if (normalized.projectId)
    await db.query("SELECT id FROM projects WHERE id=$1 FOR UPDATE", [normalized.projectId]);
  const stage = await resolveWorkflowStage(
    db,
    normalized.projectId,
    fields.workflowStage ||
      (!projectChanged && normalized.status === existing.status
        ? existing.workflow_stage
        : undefined),
    normalized.status
  );
  if (!projectChanged) {
    await assertManualTransition(db, normalized.projectId, existing.workflow_stage, stage.stage);
  }
  if (projectChanged && !normalized.projectId && Number(existing.user_id) !== Number(userId)) {
    throw new AppError(
      403,
      "TASK_INBOX_MOVE_DENIED",
      "Only this ticket's creator can move it out of the project into their inbox."
    );
  }
  if (projectChanged) {
    await verifyProjectAccess(db, existing.project_id, userId, ["owner", "editor"]);
    const dependencies = await db.query(
      `SELECT COUNT(*)::int AS count FROM task_dependencies
       WHERE blocker_task_id = $1 OR blocked_task_id = $1`,
      [taskId]
    );
    if (Number(dependencies.rows[0].count) > 0) {
      throw new AppError(
        409,
        "TASK_HAS_DEPENDENCIES",
        "Remove this ticket's blocking relationships before changing projects."
      );
    }
    const children = await db.query(
      "SELECT COUNT(*)::int AS count FROM tasks WHERE parent_task_id = $1",
      [taskId]
    );
    if (Number(children.rows[0].count) > 0) {
      throw new AppError(
        409,
        "TASK_HAS_CHILDREN",
        "Move or remove child tasks before changing this task's project."
      );
    }
  }
  await verifyParentHierarchy({
    db,
    parentId: normalized.parentId,
    projectId: normalized.projectId,
    taskType: normalized.taskType,
    userId,
    taskId
  });
  await validateAssignee(db, normalized.projectId, normalized.assigneeId);
  await validateSprint(db, normalized.projectId, normalized.sprintId);
  const result = await db.query(
    `UPDATE tasks
     SET project_id = $1, title = $2, description = $3, status = $4, priority = $5,
         start_date = $6, due_date = $7, task_type = $8, parent_task_id = $9,
         assignee_id = $10, sprint_id = $11, version = version + 1,
         workspace_id = $13, workflow_stage = $14, updated_at = CURRENT_TIMESTAMP
     WHERE id = $12
     RETURNING *`,
    [
      normalized.projectId,
      normalized.title,
      normalized.description,
      normalized.status,
      normalized.priority,
      normalized.startDate,
      normalized.dueDate,
      normalized.taskType,
      normalized.parentId,
      normalized.assigneeId,
      normalized.sprintId,
      taskId,
      currentWorkspace() ||
        (normalized.projectId
          ? (
              await db.query("SELECT workspace_id FROM projects WHERE id = $1", [
                normalized.projectId
              ])
            ).rows[0]?.workspace_id
          : await ensurePersonalWorkspace(db, { id: userId })),
      stage.stage
    ]
  );
  const task = result.rows[0];
  const activities = [];
  if (existing.status !== task.status || existing.workflow_stage !== task.workflow_stage) {
    activities.push({
      action: task.status === "completed" ? "task_completed" : "task_status_changed",
      details: {
        from: existing.status,
        to: task.status,
        fromStage: existing.workflow_stage,
        toStage: task.workflow_stage
      }
    });
  }
  if (existing.priority !== task.priority) {
    activities.push({
      action: "task_priority_changed",
      details: { from: existing.priority, to: task.priority }
    });
  }
  if (Number(existing.parent_task_id || 0) !== Number(task.parent_task_id || 0)) {
    activities.push({
      action: "task_parent_changed",
      details: { from: existing.parent_task_id, to: task.parent_task_id }
    });
  }
  if (activities.length === 0) activities.push({ action: "task_updated", details: {} });
  for (const activity of activities) {
    await logActivity(db, {
      userId,
      action: activity.action,
      entityType: "task",
      entityId: task.id,
      entityTitle: task.title,
      details: source === "manual" ? activity.details : { ...activity.details, source }
    });
  }
  if (Number(existing.assignee_id || 0) !== Number(task.assignee_id || 0)) {
    await notifyUser(db, {
      userId: task.assignee_id,
      actorId: userId,
      projectId: task.project_id,
      taskId: task.id,
      kind: "task_assigned",
      title: `Assigned to ${task.issue_key}`,
      body: task.title,
      dedupeKey: `task-assigned:${task.id}:${task.version}`
    });
  }
  return task;
};

const setTaskArchived = async (
  db,
  { userId, taskId, archived, expectedVersion, source = "manual", requirePermission = true }
) => {
  if (requirePermission) await assertPermission(db, userId, "tasks.edit");
  const existing = await loadTaskForMutation(db, {
    taskId,
    userId,
    expectedVersion,
    allowArchived: true
  });
  await verifyProjectAccess(db, existing.project_id, userId, ["owner", "editor"]);
  if (archived) {
    const children = await db.query(
      "SELECT COUNT(*)::int AS count FROM tasks WHERE parent_task_id = $1 AND archived_at IS NULL",
      [taskId]
    );
    if (Number(children.rows[0].count) > 0) {
      throw new AppError(
        409,
        "TASK_HAS_ACTIVE_CHILDREN",
        "Archive this task's active children first, or archive the whole project."
      );
    }
  } else if (existing.parent_task_id) {
    const parent = await db.query("SELECT archived_at FROM tasks WHERE id = $1", [
      existing.parent_task_id
    ]);
    if (parent.rows[0]?.archived_at) {
      throw new AppError(409, "PARENT_TASK_ARCHIVED", "Restore the parent task before this child.");
    }
  }
  const result = await db.query(
    `UPDATE tasks
     SET archived_at = ${archived ? "COALESCE(archived_at, CURRENT_TIMESTAMP)" : "NULL"},
         archived_by = $1, version = version + 1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2
     RETURNING *`,
    [archived ? userId : null, taskId]
  );
  await logActivity(db, {
    userId,
    action: archived ? "task_archived" : "task_restored",
    entityType: "task",
    entityId: result.rows[0].id,
    entityTitle: result.rows[0].title,
    details: source === "manual" ? {} : { source }
  });
  return result.rows[0];
};

const loadCriterion = async (db, taskId, criterionId) => {
  const result = await db.query(
    `SELECT ${criterionFields} FROM task_acceptance_criteria WHERE id = $1 AND task_id = $2`,
    [criterionId, taskId]
  );
  if (!result.rows[0]) {
    throw new AppError(404, "ACCEPTANCE_CRITERION_NOT_FOUND", "Acceptance criterion not found.");
  }
  return result.rows[0];
};

const prepareCriterionMutation = async (db, { userId, taskId, expectedVersion }) => {
  await assertPermission(db, userId, "tasks.edit");
  const task = await loadTaskForMutation(db, { taskId, userId, expectedVersion });
  if (task.project_id) {
    const role = await getProjectRole(db, task.project_id, userId);
    if (role !== "owner" && role !== "editor") {
      throw new AppError(
        403,
        "TASK_EDITOR_REQUIRED",
        "Project editor access is required to change acceptance criteria."
      );
    }
    await verifyProjectAccess(db, task.project_id, userId, ["owner", "editor"]);
  }
  return task;
};

const bumpTaskVersion = async (db, taskId) => {
  const result = await db.query(
    `UPDATE tasks SET version = version + 1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 RETURNING version`,
    [taskId]
  );
  return Number(result.rows[0].version);
};

const recordCriterionChange = (db, { userId, task, change, source }) =>
  logActivity(db, {
    userId,
    action: "task_updated",
    entityType: "task",
    entityId: task.id,
    entityTitle: task.title,
    details: { change, ...(source === "manual" ? {} : { source }) }
  });

const addAcceptanceCriterion = async (
  db,
  { userId, taskId, expectedVersion, body, source = "manual" }
) => {
  const task = await prepareCriterionMutation(db, { userId, taskId, expectedVersion });
  const positionResult = await db.query(
    "SELECT COALESCE(MAX(position), -1)::int AS last_position FROM task_acceptance_criteria WHERE task_id = $1",
    [task.id]
  );
  const result = await db.query(
    `INSERT INTO task_acceptance_criteria (task_id, body, position, created_by)
     VALUES ($1, $2, $3, $4) RETURNING ${criterionFields}`,
    [task.id, body, Number(positionResult.rows[0].last_position) + 1, userId]
  );
  const taskVersion = await bumpTaskVersion(db, task.id);
  await recordCriterionChange(db, {
    userId,
    task,
    change: "acceptance_criterion_added",
    source
  });
  return { criterion: result.rows[0], taskVersion };
};

const updateAcceptanceCriterion = async (
  db,
  { userId, taskId, criterionId, expectedVersion, fields, source = "manual" }
) => {
  const task = await prepareCriterionMutation(db, { userId, taskId, expectedVersion });
  const existing = await loadCriterion(db, task.id, criterionId);
  const body = Object.prototype.hasOwnProperty.call(fields, "body") ? fields.body : existing.body;
  const completed = Object.prototype.hasOwnProperty.call(fields, "completed")
    ? fields.completed
    : existing.completed;
  const result = await db.query(
    `UPDATE task_acceptance_criteria
     SET body = $1, completed = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $3 AND task_id = $4 RETURNING ${criterionFields}`,
    [body, completed, criterionId, task.id]
  );
  const taskVersion = await bumpTaskVersion(db, task.id);
  await recordCriterionChange(db, {
    userId,
    task,
    change: "acceptance_criterion_updated",
    source
  });
  return { criterion: result.rows[0], taskVersion };
};

const reorderAcceptanceCriteria = async (
  db,
  { userId, taskId, expectedVersion, criterionIds, source = "manual" }
) => {
  const task = await prepareCriterionMutation(db, { userId, taskId, expectedVersion });
  const current = await db.query(
    "SELECT id FROM task_acceptance_criteria WHERE task_id = $1 ORDER BY position ASC, id ASC",
    [task.id]
  );
  const currentIds = current.rows.map((row) => Number(row.id));
  if (
    currentIds.length !== criterionIds.length ||
    currentIds.some((criterionId) => !criterionIds.includes(criterionId))
  ) {
    throw new AppError(
      409,
      "ACCEPTANCE_CRITERIA_ORDER_MISMATCH",
      "The submitted order must include every acceptance criterion exactly once."
    );
  }
  for (const [position, criterionId] of criterionIds.entries()) {
    await db.query(
      `UPDATE task_acceptance_criteria
       SET position = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND task_id = $3`,
      [position, criterionId, task.id]
    );
  }
  const result = await db.query(
    `SELECT ${criterionFields} FROM task_acceptance_criteria
     WHERE task_id = $1 ORDER BY position ASC, id ASC`,
    [task.id]
  );
  const taskVersion = await bumpTaskVersion(db, task.id);
  await recordCriterionChange(db, {
    userId,
    task,
    change: "acceptance_criteria_reordered",
    source
  });
  return { criteria: result.rows, taskVersion };
};

const removeAcceptanceCriterion = async (
  db,
  { userId, taskId, criterionId, expectedVersion, source = "manual" }
) => {
  const task = await prepareCriterionMutation(db, { userId, taskId, expectedVersion });
  const criterion = await loadCriterion(db, task.id, criterionId);
  await db.query("DELETE FROM task_acceptance_criteria WHERE id = $1 AND task_id = $2", [
    criterionId,
    task.id
  ]);
  const taskVersion = await bumpTaskVersion(db, task.id);
  await recordCriterionChange(db, {
    userId,
    task,
    change: "acceptance_criterion_deleted",
    source
  });
  return { criterion, taskVersion };
};

module.exports = {
  addAcceptanceCriterion,
  assertPermission,
  createTask,
  loadTaskForMutation,
  removeAcceptanceCriterion,
  reorderAcceptanceCriteria,
  setTaskArchived,
  updateAcceptanceCriterion,
  updateTask,
  validateAssignee,
  validateSprint,
  verifyParentHierarchy,
  verifyProjectAccess
};
