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
  repositorySelection: z
    .object({ selected: z.boolean(), projectId: positiveId.nullable() })
    .strict()
    .superRefine((value, context) => {
      if (!value.selected && value.projectId !== null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["projectId"],
          message: "An unselected repository cannot be assigned to a project."
        });
      }
    }),
  taskParams: z.object({ taskId: positiveId }).strict()
};

module.exports = { githubIntegrationSchemas };
