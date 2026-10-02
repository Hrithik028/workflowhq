const { z } = require("zod");

const statusSchema = z.enum(["todo", "in_progress", "completed"]);
const prioritySchema = z.enum(["low", "medium", "high"]);
const taskTypeSchema = z.enum(["initiative", "epic", "story", "task", "bug", "subtask"]);
const idSchema = z.coerce.number().int().positive();
const nullableIdSchema = z.union([idSchema, z.null()]);
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u)
  .nullable();
const newReferenceSchema = z
  .string()
  .trim()
  .min(5)
  .max(80)
  .regex(/^new:[A-Za-z0-9_-]+$/u);
const taskReferenceSchema = z.union([idSchema, newReferenceSchema]);
const actionIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z0-9:_-]+$/u);
const evidenceIdsSchema = z
  .array(z.string().regex(/^(?:task|github):\d+$/u))
  .max(8)
  .default([]);

const plannedTaskSchema = z
  .object({
    tempId: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .regex(/^[A-Za-z0-9_-]+$/u),
    parentTempId: z.string().trim().min(1).max(40).nullable(),
    taskType: taskTypeSchema,
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5000).default(""),
    priority: prioritySchema.default("medium"),
    dueDate: dateSchema.default(null),
    evidenceIds: evidenceIdsSchema,
    acceptanceCriteria: z.array(z.string().trim().min(1).max(1000)).max(12).default([])
  })
  .strict();

const validateLegacyHierarchy = (plan, context) => {
  const byId = new Map();
  plan.tasks.forEach((task, index) => {
    if (byId.has(task.tempId)) {
      context.addIssue({
        code: "custom",
        path: ["tasks", index, "tempId"],
        message: "Temporary IDs must be unique."
      });
    }
    byId.set(task.tempId, task);
  });
  const rank = { initiative: 6, epic: 5, story: 4, task: 3, bug: 3, subtask: 2 };
  plan.tasks.forEach((task, index) => {
    if (!task.parentTempId) return;
    const parent = byId.get(task.parentTempId);
    if (!parent) {
      context.addIssue({
        code: "custom",
        path: ["tasks", index, "parentTempId"],
        message: "Parent must be included in the plan."
      });
    } else if (rank[parent.taskType] <= rank[task.taskType]) {
      context.addIssue({
        code: "custom",
        path: ["tasks", index, "parentTempId"],
        message: "Parent must be a higher-level work item."
      });
    }
  });
};

const legacyPlanSchema = z
  .object({
    summary: z.string().trim().min(1).max(1000),
    tasks: z.array(plannedTaskSchema).min(1).max(30)
  })
  .strict()
  .superRefine(validateLegacyHierarchy);

const taskCreateFieldsSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5000).default(""),
    status: statusSchema.default("todo"),
    priority: prioritySchema.default("medium"),
    startDate: dateSchema.default(null),
    dueDate: dateSchema.default(null),
    taskType: taskTypeSchema.default("task"),
    parentRef: z.union([taskReferenceSchema, z.null()]).default(null),
    assigneeId: nullableIdSchema.default(null),
    sprintId: nullableIdSchema.default(null)
  })
  .strict()
  .refine((value) => !value.startDate || !value.dueDate || value.startDate <= value.dueDate, {
    message: "Start date must be on or before the due date.",
    path: ["startDate"]
  });

const taskUpdateFieldsSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(5000).optional(),
    status: statusSchema.optional(),
    priority: prioritySchema.optional(),
    startDate: dateSchema.optional(),
    dueDate: dateSchema.optional(),
    taskType: taskTypeSchema.optional(),
    parentRef: z.union([taskReferenceSchema, z.null()]).optional(),
    assigneeId: nullableIdSchema.optional(),
    sprintId: nullableIdSchema.optional()
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: "Provide at least one field." });

const actionBase = { id: actionIdSchema, evidenceIds: evidenceIdsSchema };
const existingTarget = {
  taskRef: taskReferenceSchema,
  expectedVersion: z.coerce.number().int().positive().optional()
};

const actionSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...actionBase,
      type: z.literal("task.create"),
      tempId: newReferenceSchema,
      fields: taskCreateFieldsSchema
    })
    .strict(),
  z
    .object({
      ...actionBase,
      ...existingTarget,
      type: z.literal("task.update"),
      fields: taskUpdateFieldsSchema
    })
    .strict(),
  z.object({ ...actionBase, ...existingTarget, type: z.literal("task.archive") }).strict(),
  z.object({ ...actionBase, ...existingTarget, type: z.literal("task.restore") }).strict(),
  z
    .object({
      ...actionBase,
      ...existingTarget,
      type: z.literal("criterion.add"),
      body: z.string().trim().min(1).max(1000)
    })
    .strict(),
  z
    .object({
      ...actionBase,
      ...existingTarget,
      type: z.literal("criterion.update"),
      criterionId: idSchema,
      fields: z
        .object({
          body: z.string().trim().min(1).max(1000).optional(),
          completed: z.boolean().optional()
        })
        .strict()
        .refine((value) => Object.keys(value).length > 0, {
          message: "Provide a body or completion state."
        })
    })
    .strict(),
  z
    .object({
      ...actionBase,
      ...existingTarget,
      type: z.literal("criterion.complete"),
      criterionId: idSchema
    })
    .strict(),
  z
    .object({
      ...actionBase,
      ...existingTarget,
      type: z.literal("criterion.reorder"),
      criterionIds: z.array(idSchema).max(100)
    })
    .strict()
    .refine((value) => new Set(value.criterionIds).size === value.criterionIds.length, {
      message: "Acceptance criterion IDs must be unique.",
      path: ["criterionIds"]
    }),
  z
    .object({
      ...actionBase,
      ...existingTarget,
      type: z.literal("criterion.remove"),
      criterionId: idSchema
    })
    .strict()
]);

const actionPlanSchema = z
  .object({
    summary: z.string().trim().min(1).max(1000),
    actions: z.array(actionSchema).min(1).max(100)
  })
  .strict()
  .superRefine((plan, context) => {
    const actionIds = new Set();
    const created = new Map();
    plan.actions.forEach((action, index) => {
      if (actionIds.has(action.id)) {
        context.addIssue({
          code: "custom",
          path: ["actions", index, "id"],
          message: "Action IDs must be unique."
        });
      }
      actionIds.add(action.id);
      if (action.type === "task.create") {
        if (created.has(action.tempId)) {
          context.addIssue({
            code: "custom",
            path: ["actions", index, "tempId"],
            message: "Temporary task references must be unique."
          });
        }
        created.set(action.tempId, action);
      }
    });

    const referenced = [];
    plan.actions.forEach((action, index) => {
      if (action.type === "task.create" && typeof action.fields.parentRef === "string") {
        referenced.push([action.fields.parentRef, index, "fields", "parentRef"]);
      }
      if (action.type === "task.update" && typeof action.fields.parentRef === "string") {
        referenced.push([action.fields.parentRef, index, "fields", "parentRef"]);
      }
      if ("taskRef" in action) {
        if (typeof action.taskRef === "string") {
          referenced.push([action.taskRef, index, "taskRef"]);
        } else if (!action.expectedVersion) {
          context.addIssue({
            code: "custom",
            path: ["actions", index, "expectedVersion"],
            message: "Existing ticket actions require the reviewed ticket version."
          });
        }
      }
    });
    referenced.forEach(([reference, index, ...path]) => {
      if (!created.has(reference)) {
        context.addIssue({
          code: "custom",
          path: ["actions", index, ...path],
          message: "Temporary ticket reference must be created in this plan."
        });
      }
    });
  });

const planSchema = z.union([legacyPlanSchema, actionPlanSchema]);

const aiPlannerSchemas = {
  params: z.object({ id: z.coerce.number().int().positive() }),
  preview: z
    .object({
      provider: z.enum(["openai", "anthropic", "google"]),
      model: z.string().trim().min(1).max(120),
      goal: z.string().trim().min(10).max(5000),
      context: z.string().trim().max(10000).default(""),
      maxItems: z.coerce.number().int().min(1).max(30).default(12),
      contextOptions: z
        .object({
          includeProjectTasks: z.boolean().default(true),
          includeGithubActivity: z.boolean().default(true),
          repositoryIds: z.array(z.coerce.number().int().positive()).max(20).default([])
        })
        .strict()
        .default({
          includeProjectTasks: true,
          includeGithubActivity: true,
          repositoryIds: []
        })
    })
    .strict(),
  apply: z
    .object({
      approvalId: z.string().uuid(),
      idempotencyKey: z.string().trim().min(8).max(100).optional(),
      plan: planSchema
    })
    .strict()
    .superRefine((value, context) => {
      if (value.plan.actions && !value.idempotencyKey) {
        context.addIssue({
          code: "custom",
          path: ["idempotencyKey"],
          message: "Action plans require an idempotency key."
        });
      }
    }),
  actionPlan: actionPlanSchema,
  plan: planSchema
};

const aiConversationSchemas = {
  params: z.object({
    id: z.coerce.number().int().positive(),
    conversationId: z.string().uuid().optional(),
    proposalId: z.string().uuid().optional()
  }),
  create: z
    .object({
      title: z
        .string()
        .trim()
        .min(1)
        .max(160)
        .regex(/^[^\u0000-\u001F\u007F]+$/u, "Title contains unsupported control characters."),
      provider: z.enum(["openai", "anthropic", "google"]),
      model: z
        .string()
        .trim()
        .min(1)
        .max(120)
        .regex(/^[^\u0000-\u001F\u007F]+$/u, "Model contains unsupported control characters.")
    })
    .strict(),
  run: z
    .object({
      outputMode: z.enum(["tasks", "actions"]).default("tasks"),
      goal: z.string().trim().min(10).max(5000),
      context: z.string().trim().max(10000).default(""),
      maxItems: z.coerce.number().int().min(1).max(30).default(12),
      contextOptions: z
        .object({
          includeProjectTasks: z.boolean().default(true),
          includeGithubActivity: z.boolean().default(true),
          repositoryIds: z.array(z.coerce.number().int().positive()).max(20).default([])
        })
        .strict()
        .default({
          includeProjectTasks: true,
          includeGithubActivity: true,
          repositoryIds: []
        })
    })
    .strict()
};

module.exports = { aiConversationSchemas, aiPlannerSchemas };
