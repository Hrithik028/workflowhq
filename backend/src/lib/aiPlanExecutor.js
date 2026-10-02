const { logActivity } = require("./activity");
const { AppError } = require("./errors");
const {
  addAcceptanceCriterion,
  createTask,
  loadTaskForMutation,
  removeAcceptanceCriterion,
  reorderAcceptanceCriteria,
  setTaskArchived,
  updateAcceptanceCriterion,
  updateTask
} = require("./taskMutationService");

const parseJsonColumn = (value) => (typeof value === "string" ? JSON.parse(value) : value);

const findCompletedExecution = async (db, { approvalId, userId, projectId, idempotencyKey }) => {
  const existing = await db.query(
    `SELECT id, approval_id, response
     FROM ai_plan_executions
     WHERE user_id = $1 AND project_id = $2 AND idempotency_key = $3`,
    [userId, projectId, idempotencyKey]
  );
  const row = existing.rows[0];
  if (!row) return null;
  if (row.approval_id !== approvalId) {
    throw new AppError(
      409,
      "AI_IDEMPOTENCY_KEY_REUSED",
      "That idempotency key is already bound to a different approved plan."
    );
  }
  return row.response
    ? { id: Number(row.id), replay: true, response: parseJsonColumn(row.response) }
    : null;
};

const reserveExecution = async (db, { approvalId, userId, projectId, idempotencyKey }) => {
  const inserted = await db.query(
    `INSERT INTO ai_plan_executions
       (approval_id, user_id, project_id, idempotency_key)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [approvalId, userId, projectId, idempotencyKey]
  );
  if (inserted.rows[0]) return { id: Number(inserted.rows[0].id), replay: false };

  const replay = await findCompletedExecution(db, {
    approvalId,
    userId,
    projectId,
    idempotencyKey
  });
  if (replay) return replay;
  throw new AppError(
    409,
    "AI_PLAN_APPROVAL_USED",
    "This AI preview has already been applied with a different idempotency key."
  );
};

const completeExecution = (db, executionId, response) =>
  db.query(
    `UPDATE ai_plan_executions
     SET response = $1::jsonb, completed_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [JSON.stringify(response), executionId]
  );

const assertConsistentReviewedVersions = async (db, { actions, userId, projectId }) => {
  const expectedByTask = new Map();
  for (const action of actions) {
    if (!("taskRef" in action) || typeof action.taskRef === "string") continue;
    const taskId = Number(action.taskRef);
    const expectedVersion = Number(action.expectedVersion);
    if (expectedByTask.has(taskId) && expectedByTask.get(taskId) !== expectedVersion) {
      throw new AppError(
        422,
        "AI_PLAN_VERSION_INVALID",
        "Every action for a ticket must use the same reviewed version."
      );
    }
    expectedByTask.set(taskId, expectedVersion);
  }

  const reviewedTasks = [...expectedByTask].sort(([left], [right]) => left - right);
  for (const [taskId, expectedVersion] of reviewedTasks) {
    const task = await loadTaskForMutation(db, {
      taskId,
      userId,
      expectedVersion,
      allowArchived: true
    });
    if (Number(task.project_id) !== Number(projectId)) {
      throw new AppError(404, "TASK_NOT_FOUND", "Task not found.");
    }
  }
};

const resolveTaskRef = (reference, createdByTempId) => {
  if (reference == null || typeof reference === "number") return reference;
  const taskId = createdByTempId.get(reference);
  if (!taskId) {
    throw new AppError(
      422,
      "AI_PLAN_TEMP_REFERENCE_INVALID",
      `Temporary ticket reference ${reference} could not be resolved.`
    );
  }
  return taskId;
};

const executeAction = async (
  db,
  { action, userId, projectId, createdByTempId, resultsByActionId }
) => {
  if (action.type === "task.create") {
    const parentId = resolveTaskRef(action.fields.parentRef, createdByTempId);
    const task = await createTask(db, {
      userId,
      source: "ai_plan",
      evidenceIds: action.evidenceIds,
      fields: { ...action.fields, projectId, parentId }
    });
    createdByTempId.set(action.tempId, Number(task.id));
    resultsByActionId.set(action.id, {
      actionId: action.id,
      type: action.type,
      taskId: Number(task.id),
      issueKey: task.issue_key,
      tempId: action.tempId,
      version: Number(task.version)
    });
    return;
  }
  const taskId = resolveTaskRef(action.taskRef, createdByTempId);
  let result;
  if (action.type === "task.update") {
    const fields = { ...action.fields };
    if (Object.prototype.hasOwnProperty.call(fields, "parentRef")) {
      fields.parentId = resolveTaskRef(fields.parentRef, createdByTempId);
      delete fields.parentRef;
    }
    const task = await updateTask(db, {
      userId,
      taskId,
      fields,
      source: "ai_plan"
    });
    result = { taskId, version: Number(task.version) };
  } else if (action.type === "task.archive" || action.type === "task.restore") {
    const task = await setTaskArchived(db, {
      userId,
      taskId,
      archived: action.type === "task.archive",
      source: "ai_plan"
    });
    result = { taskId, version: Number(task.version), archived: Boolean(task.archived_at) };
  } else if (action.type === "criterion.add") {
    const mutation = await addAcceptanceCriterion(db, {
      userId,
      taskId,
      body: action.body,
      source: "ai_plan"
    });
    result = {
      taskId,
      criterionId: Number(mutation.criterion.id),
      version: mutation.taskVersion
    };
  } else if (action.type === "criterion.update" || action.type === "criterion.complete") {
    const mutation = await updateAcceptanceCriterion(db, {
      userId,
      taskId,
      criterionId: action.criterionId,
      fields: action.type === "criterion.complete" ? { completed: true } : action.fields,
      source: "ai_plan"
    });
    result = {
      taskId,
      criterionId: Number(mutation.criterion.id),
      completed: mutation.criterion.completed,
      version: mutation.taskVersion
    };
  } else if (action.type === "criterion.reorder") {
    const mutation = await reorderAcceptanceCriteria(db, {
      userId,
      taskId,
      criterionIds: action.criterionIds,
      source: "ai_plan"
    });
    result = {
      taskId,
      criterionIds: mutation.criteria.map((criterion) => Number(criterion.id)),
      version: mutation.taskVersion
    };
  } else if (action.type === "criterion.remove") {
    const mutation = await removeAcceptanceCriterion(db, {
      userId,
      taskId,
      criterionId: action.criterionId,
      source: "ai_plan"
    });
    result = {
      taskId,
      criterionId: Number(mutation.criterion.id),
      removed: true,
      version: mutation.taskVersion
    };
  } else {
    throw new AppError(
      422,
      "AI_ACTION_FORBIDDEN",
      "The approved plan contains an unsupported or destructive action."
    );
  }
  resultsByActionId.set(action.id, { actionId: action.id, type: action.type, ...result });
};

const executeActionPlan = async (
  db,
  { plan, approvalId, idempotencyKey, userId, project, reservation: existingReservation }
) => {
  const reservation =
    existingReservation ||
    (await reserveExecution(db, {
      approvalId,
      idempotencyKey,
      userId,
      projectId: project.id
    }));
  if (reservation.replay) return { ...reservation.response, idempotent: true };

  await assertConsistentReviewedVersions(db, {
    actions: plan.actions,
    userId,
    projectId: project.id
  });
  const createdByTempId = new Map();
  const resultsByActionId = new Map();
  const pending = [...plan.actions];
  while (pending.length > 0) {
    const index = pending.findIndex((action) => {
      const targetReady =
        !("taskRef" in action) ||
        typeof action.taskRef !== "string" ||
        createdByTempId.has(action.taskRef);
      const parentReady =
        action.type !== "task.create" && action.type !== "task.update"
          ? true
          : typeof action.fields.parentRef !== "string" ||
            createdByTempId.has(action.fields.parentRef);
      return targetReady && parentReady;
    });
    if (index === -1) {
      throw new AppError(
        422,
        "AI_PLAN_TEMP_REFERENCE_INVALID",
        "The approved plan contains unresolved temporary ticket references."
      );
    }
    const [action] = pending.splice(index, 1);
    await executeAction(db, {
      action,
      userId,
      projectId: project.id,
      createdByTempId,
      resultsByActionId
    });
  }
  const response = {
    executionId: reservation.id,
    idempotent: false,
    results: plan.actions.map((action) => resultsByActionId.get(action.id)),
    references: Object.fromEntries(createdByTempId)
  };
  await logActivity(db, {
    userId,
    action: "ai_plan_applied",
    entityType: "project",
    entityId: project.id,
    entityTitle: project.name,
    details: { approvalId, executionId: reservation.id, actionCount: plan.actions.length }
  });
  await completeExecution(db, reservation.id, response);
  return response;
};

const executeLegacyPlan = async (db, { plan, approvalId, userId, project }) => {
  const pending = [...plan.tasks];
  const createdByTempId = new Map();
  const created = [];
  while (pending.length > 0) {
    const index = pending.findIndex(
      (task) => !task.parentTempId || createdByTempId.has(task.parentTempId)
    );
    if (index === -1) {
      throw new AppError(
        422,
        "AI_PLAN_HIERARCHY_INVALID",
        "The approved plan contains an invalid hierarchy."
      );
    }
    const [item] = pending.splice(index, 1);
    const task = await createTask(db, {
      userId,
      source: "ai_plan",
      evidenceIds: item.evidenceIds,
      fields: {
        projectId: project.id,
        title: item.title,
        description: item.description,
        priority: item.priority,
        dueDate: item.dueDate,
        taskType: item.taskType,
        parentId: item.parentTempId ? createdByTempId.get(item.parentTempId) : null
      }
    });
    for (const body of item.acceptanceCriteria) {
      await addAcceptanceCriterion(db, {
        userId,
        taskId: task.id,
        body,
        source: "ai_plan"
      });
    }
    createdByTempId.set(item.tempId, Number(task.id));
    created.push({
      id: Number(task.id),
      issueKey: task.issue_key,
      tempId: item.tempId,
      title: task.title
    });
  }
  await logActivity(db, {
    userId,
    action: "ai_plan_applied",
    entityType: "project",
    entityId: project.id,
    entityTitle: project.name,
    details: { approvalId, createdCount: created.length }
  });
  return { created };
};

module.exports = {
  executeActionPlan,
  executeLegacyPlan,
  findCompletedActionExecution: findCompletedExecution,
  reserveActionExecution: reserveExecution
};
