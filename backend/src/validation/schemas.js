const { z } = require("zod");

const statusSchema = z.enum(["todo", "in_progress", "completed"]);
const prioritySchema = z.enum(["low", "medium", "high"]);
const taskTypeSchema = z.enum(["initiative", "epic", "story", "task", "bug", "subtask"]);
const idSchema = z.coerce.number().int().positive();
const projectKeySchema = z
  .string()
  .trim()
  .min(2)
  .max(10)
  .regex(/^[A-Za-z][A-Za-z0-9]*$/, "Use 2-10 letters and numbers, starting with a letter.")
  .transform((value) => value.toUpperCase());
const optionalDate = z
  .union([
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date in YYYY-MM-DD format."),
    z.literal(""),
    z.null()
  ])
  .transform((value) => value || null);

const authSchemas = {
  register: z
    .object({
      name: z.string().trim().min(2).max(100),
      email: z
        .string()
        .trim()
        .email()
        .max(255)
        .transform((value) => value.toLowerCase()),
      password: z.string().min(8).max(72)
    })
    .strict(),
  login: z
    .object({
      email: z
        .string()
        .trim()
        .email()
        .max(255)
        .transform((value) => value.toLowerCase()),
      password: z.string().min(1).max(72)
    })
    .strict()
};

const projectSchemas = {
  params: z.object({ id: idSchema }),
  create: z
    .object({
      key: projectKeySchema,
      name: z.string().trim().min(1).max(120),
      description: z.string().trim().max(1000).default("")
    })
    .strict(),
  update: z
    .object({
      key: projectKeySchema,
      name: z.string().trim().min(1).max(120),
      description: z.string().trim().max(1000).default("")
    })
    .strict()
};

const taskBodySchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5000).default(""),
    status: statusSchema.default("todo"),
    priority: prioritySchema.default("medium"),
    startDate: optionalDate.optional().default(null),
    dueDate: optionalDate.optional().default(null),
    projectId: z.union([idSchema, z.null()]).optional().default(null),
    taskType: taskTypeSchema.default("task"),
    parentId: z.union([idSchema, z.null()]).optional().default(null),
    assigneeId: z.union([idSchema, z.null()]).optional().default(null)
  })
  .strict()
  .refine((value) => !value.startDate || !value.dueDate || value.startDate <= value.dueDate, {
    message: "Start date must be on or before the due date.",
    path: ["startDate"]
  });

const taskSchemas = {
  params: z.object({ id: idSchema }),
  create: taskBodySchema,
  update: taskBodySchema,
  list: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    status: statusSchema.optional(),
    priority: prioritySchema.optional(),
    projectId: idSchema.optional(),
    search: z.string().trim().max(100).optional(),
    sort: z
      .enum(["updated_at", "created_at", "due_date", "title", "priority", "rank"])
      .default("updated_at"),
    order: z.enum(["asc", "desc"]).default("desc")
  })
};

const taskRankSchema = z
  .object({
    previousTaskId: z.union([idSchema, z.null()]),
    nextTaskId: z.union([idSchema, z.null()])
  })
  .strict()
  .refine((value) => value.previousTaskId != null || value.nextTaskId != null, {
    message: "Provide at least one neighboring task.",
    path: ["previousTaskId"]
  });

const activitySchemas = {
  list: z.object({
    limit: z.coerce.number().int().positive().max(50).default(12)
  })
};

const memberEmailSchema = z
  .string()
  .trim()
  .email()
  .max(255)
  .transform((value) => value.toLowerCase());

const projectMemberSchemas = {
  params: z.object({ id: idSchema }),
  memberParams: z.object({ id: idSchema, userId: idSchema }),
  add: z
    .object({
      email: memberEmailSchema,
      role: z.enum(["editor", "viewer"])
    })
    .strict(),
  updateRole: z
    .object({
      role: z.enum(["owner", "editor", "viewer"])
    })
    .strict()
};

const labelColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #4C6EF5.")
  .transform((value) => value.toLowerCase());

const labelBodySchema = z
  .object({
    name: z.string().trim().min(1).max(40),
    color: labelColorSchema
  })
  .strict();

const labelSchemas = {
  params: z.object({ id: idSchema }),
  labelParams: z.object({ id: idSchema, labelId: idSchema }),
  create: labelBodySchema,
  update: labelBodySchema
};

const taskLabelSchemas = {
  params: z.object({ id: idSchema }),
  labelParams: z.object({ id: idSchema, labelId: idSchema }),
  attach: z.object({ labelId: idSchema }).strict()
};

const commentBodySchema = z
  .object({
    body: z.string().trim().min(1).max(2000)
  })
  .strict();

const commentSchemas = {
  params: z.object({ id: idSchema }),
  commentParams: z.object({ id: idSchema, commentId: idSchema }),
  create: commentBodySchema,
  update: commentBodySchema
};

module.exports = {
  activitySchemas,
  authSchemas,
  commentSchemas,
  labelSchemas,
  projectMemberSchemas,
  projectSchemas,
  taskLabelSchemas,
  taskRankSchema,
  taskSchemas
};
