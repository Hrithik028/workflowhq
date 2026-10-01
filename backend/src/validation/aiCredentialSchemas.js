const { z } = require("zod");

const provider = z.enum(["openai", "anthropic", "google"]);
const credential = z
  .string()
  .trim()
  .min(10)
  .max(500)
  .regex(/^[\x21-\x7E]+$/u, "Credential must contain printable ASCII characters only.");

const aiCredentialSchemas = {
  providerParams: z.object({ provider }),
  credential: z.object({ provider, credential }).strict(),
  replacement: z.object({ credential }).strict()
};

module.exports = { aiCredentialSchemas };
