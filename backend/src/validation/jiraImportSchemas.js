const { z } = require("zod");

const params = z.object({ id: z.coerce.number().int().positive() });
const siteUrl = z
  .string()
  .trim()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      /^[a-z0-9][a-z0-9-]*\.atlassian\.net$/i.test(url.hostname) &&
      !url.port &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password
    );
  }, "Use the root HTTPS URL of a Jira Cloud site, such as https://team.atlassian.net.")
  .transform((value) => new URL(value).origin);

const jiraImportSchemas = {
  params,
  preview: z
    .object({
      siteUrl,
      jiraProjectKey: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z][A-Z0-9]{1,19}$/),
      csv: z.string().min(10).max(100_000)
    })
    .strict(),
  apply: z
    .object({
      previewId: z.string().uuid(),
      csv: z.string().min(10).max(100_000),
      issueKeys: z
        .array(z.string().regex(/^[A-Z][A-Z0-9]{1,19}-[1-9][0-9]*$/))
        .min(1)
        .max(100)
    })
    .strict()
};

module.exports = { jiraImportSchemas };
