const { z } = require("zod");

const permissions = z
  .object({
    "projects.create": z.boolean(),
    "projects.edit": z.boolean(),
    "projects.delete": z.boolean(),
    "projects.members": z.boolean(),
    "tasks.create": z.boolean(),
    "tasks.edit": z.boolean(),
    "tasks.delete": z.boolean(),
    "github.manage": z.boolean()
  })
  .strict();

const adminSchemas = {
  userParams: z.object({ id: z.coerce.number().int().positive() }),
  userAccess: z
    .object({
      role: z.enum(["user", "admin"]),
      permissions
    })
    .strict(),
  rules: z
    .object({
      allow_task_deletion: z.boolean(),
      allow_project_deletion: z.boolean(),
      require_due_date_for_high_priority: z.boolean(),
      max_open_tasks_per_user: z.number().int().min(1).max(1000)
    })
    .strict()
};

module.exports = { adminSchemas };
