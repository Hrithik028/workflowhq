const { AppError } = require("./errors");

const object = (properties) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties
});
const text = (maxLength, minLength = 1) => ({ type: "string", minLength, maxLength });
const positiveId = { type: "integer", minimum: 1 };
const reference = {
  anyOf: [positiveId, { type: "string", pattern: "^new:[A-Za-z0-9_-]+$", maxLength: 80 }]
};
const nullable = (schema) => ({ anyOf: [schema, { type: "null" }] });
const date = nullable({ type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" });
const fields = {
  title: text(200),
  description: text(5000, 0),
  status: { type: "string", enum: ["todo", "in_progress", "completed"] },
  priority: { type: "string", enum: ["low", "medium", "high"] },
  startDate: date,
  dueDate: date,
  taskType: { type: "string", enum: ["initiative", "epic", "story", "task", "bug", "subtask"] },
  parentRef: nullable(reference)
};
const action = (type, properties) =>
  object({
    id: { ...text(80), pattern: "^[A-Za-z0-9:_-]+$" },
    type: { type: "string", enum: [type] },
    evidenceIds: {
      type: "array",
      maxItems: 8,
      items: { type: "string", pattern: "^(task|github):[0-9]+$" }
    },
    ...properties
  });
const target = { taskRef: reference, expectedVersion: nullable(positiveId) };

const actionPlanJsonSchema = (maxItems) =>
  object({
    summary: text(1000),
    actions: {
      type: "array",
      minItems: 1,
      maxItems,
      items: {
        anyOf: [
          action("task.create", { tempId: reference.anyOf[1], fields: object(fields) }),
          // One explicit field per update avoids interpreting null as "leave unchanged".
          ...Object.entries(fields).map(([key, schema]) =>
            action("task.update", { ...target, fields: object({ [key]: schema }) })
          ),
          action("task.archive", target),
          action("task.restore", target),
          action("criterion.add", { ...target, body: text(1000) }),
          action("criterion.update", {
            ...target,
            criterionId: positiveId,
            fields: object({ body: text(1000) })
          }),
          action("criterion.update", {
            ...target,
            criterionId: positiveId,
            fields: object({ completed: { type: "boolean" } })
          }),
          action("criterion.complete", { ...target, criterionId: positiveId }),
          action("criterion.remove", { ...target, criterionId: positiveId }),
          action("criterion.reorder", {
            ...target,
            criterionIds: { type: "array", maxItems: 100, items: positiveId }
          })
        ]
      }
    }
  });

const normalizeGeneratedActions = (result) => {
  if (!Array.isArray(result?.actions)) return result;
  return {
    ...result,
    actions: result.actions.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return item;
      if (item.expectedVersion !== null) return item;
      const actionItem = { ...item };
      delete actionItem.expectedVersion;
      return actionItem;
    })
  };
};

const validateGeneratedTargets = (plan, projectContext) => {
  const tasks = new Map((projectContext?.existingTasks || []).map((task) => [task.id, task]));
  for (const actionItem of plan.actions) {
    const task = tasks.get(actionItem.taskRef);
    if (
      typeof actionItem.taskRef === "number" &&
      (!task || task.version !== actionItem.expectedVersion)
    ) {
      throw new AppError(
        502,
        "AI_PLAN_TARGET_INVALID",
        "The proposal references a ticket or version outside the supplied project context."
      );
    }
    if (
      typeof actionItem.fields?.parentRef === "number" &&
      !tasks.has(actionItem.fields.parentRef)
    ) {
      throw new AppError(
        502,
        "AI_PLAN_TARGET_INVALID",
        "The proposal references a parent outside the supplied project context."
      );
    }
    const criterionIds =
      actionItem.criterionIds || (actionItem.criterionId ? [actionItem.criterionId] : []);
    if (criterionIds.some((id) => !(task?.criterionIds || []).includes(id))) {
      throw new AppError(
        502,
        "AI_PLAN_TARGET_INVALID",
        "The proposal references acceptance criteria outside the supplied ticket context."
      );
    }
  }
};

module.exports = { actionPlanJsonSchema, normalizeGeneratedActions, validateGeneratedTargets };
