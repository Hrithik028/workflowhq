const { z } = require("zod");

const positiveId = z.coerce.number().int().positive();
const optionalBooleanQuery = z
  .enum(["true", "false"])
  .transform((value) => value === "true")
  .optional();

const githubIntegrationSchemas = {
  repositoryListQuery: z
    .object({
      installationId: positiveId.optional(),
      projectId: positiveId.optional(),
      selected: optionalBooleanQuery
    })
    .strict(),
  repositoryParams: z.object({ repositoryId: positiveId }).strict(),
  identityParams: z.object({ mappingId: positiveId }).strict(),
  deliveryParams: z.object({ deliveryId: positiveId }).strict(),
  installationParams: z.object({ installationId: positiveId }).strict(),
  projectParams: z.object({ projectId: positiveId }).strict(),
  callbackQuery: z
    .object({
      code: z.string().min(1).max(500),
      installation_id: positiveId,
      setup_action: z.enum(["install", "update"]).optional(),
      state: z.string().min(20).max(200)
    })
    .strict(),
  repositorySelection: z
    .object({ selected: z.boolean(), projectId: positiveId.nullable() })
    .strict(),
  identityMapping: z
    .object({
      installationId: positiveId,
      githubLogin: z
        .string()
        .trim()
        .regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/, "Choose a human GitHub account."),
      userId: positiveId
    })
    .strict(),
  taskParams: z.object({ taskId: positiveId }).strict()
};

module.exports = { githubIntegrationSchemas };
