const { z } = require("zod");

const plannedTaskSchema = z
  .object({
    tempId: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .regex(/^[A-Za-z0-9_-]+$/u),
    parentTempId: z.string().trim().min(1).max(40).nullable(),
    taskType: z.enum(["initiative", "epic", "story", "task", "bug", "subtask"]),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5000).default(""),
    priority: z.enum(["low", "medium", "high"]).default("medium"),
    dueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/u)
      .nullable()
      .default(null),
    acceptanceCriteria: z.array(z.string().trim().min(1).max(1000)).max(12).default([])
  })
  .strict();

const planSchema = z
  .object({
    summary: z.string().trim().min(1).max(1000),
    tasks: z.array(plannedTaskSchema).min(1).max(30)
  })
  .strict()
  .superRefine((plan, context) => {
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
  });

const aiPlannerSchemas = {
  params: z.object({ id: z.coerce.number().int().positive() }),
  preview: z
    .object({
      provider: z.enum(["openai", "anthropic", "google"]),
      apiKey: z.string().trim().min(10).max(500),
      model: z.string().trim().min(1).max(120),
      goal: z.string().trim().min(10).max(5000),
      context: z.string().trim().max(10000).default(""),
      maxItems: z.coerce.number().int().min(1).max(30).default(12)
    })
    .strict(),
  apply: z.object({ plan: planSchema }).strict(),
  plan: planSchema
};

module.exports = { aiPlannerSchemas };
