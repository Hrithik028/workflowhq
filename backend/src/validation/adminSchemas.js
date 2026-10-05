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

const aiProviderPolicy = z
  .object({
    provider: z.enum(["openai", "anthropic", "google"]),
    enabled: z.boolean(),
    allowedModels: z.array(z.string().trim().min(1).max(120)).max(50),
    defaultModel: z.string().trim().min(1).max(120).nullable()
  })
  .strict()
  .refine(
    (policy) => policy.defaultModel == null || policy.allowedModels.includes(policy.defaultModel),
    {
      message: "The default model must be included in the provider allowlist.",
      path: ["defaultModel"]
    }
  );

const adminSchemas = {
  userParams: z.object({ id: z.coerce.number().int().positive() }),
  userAccess: z
    .object({
      role: z.enum(["user", "admin"]),
      permissions
    })
    .strict(),
  ownershipTransfer: z
    .object({
      targetUserId: z.number().int().positive(),
      password: z.string().min(8).max(200)
    })
    .strict(),
  aiGovernance: z
    .object({
      providerPolicies: z.array(aiProviderPolicy).length(3),
      dailyRunLimit: z.number().int().min(1).max(1000),
      maxPromptCharacters: z.number().int().min(1000).max(100000),
      maxOutputTokens: z.number().int().min(256).max(20000),
      maxProposedActions: z.number().int().min(1).max(100),
      requestTimeoutMs: z.number().int().min(5000).max(120000),
      retentionDays: z.number().int().min(1).max(365)
    })
    .strict()
    .refine(
      (settings) => new Set(settings.providerPolicies.map((policy) => policy.provider)).size === 3,
      { message: "Configure each supported provider exactly once.", path: ["providerPolicies"] }
    ),
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
