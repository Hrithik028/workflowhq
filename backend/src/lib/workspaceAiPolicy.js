const { z } = require("zod");
const { currentWorkspace } = require("./workspaceContext");
const { AppError } = require("./errors");

const workspaceAiPolicySchema = z
  .object({
    allowedProviders: z
      .array(z.enum(["openai", "anthropic", "google"]))
      .max(3)
      .refine((items) => new Set(items).size === items.length),
    dailyRunLimit: z.number().int().min(1).max(100),
    maxPromptCharacters: z.number().int().min(100).max(50000),
    maxOutputTokens: z.number().int().min(100).max(10000),
    maxProposedActions: z.number().int().min(1).max(50)
  })
  .strict();

const readWorkspaceAiPolicy = async (db, workspaceId) => {
  const rules =
    (await db.query("SELECT rules FROM workspace_settings WHERE workspace_id = $1", [workspaceId]))
      .rows[0]?.rules || {};
  const defaults = {
    allowedProviders: ["openai", "anthropic", "google"],
    dailyRunLimit: 100,
    maxPromptCharacters: 50000,
    maxOutputTokens: 10000,
    maxProposedActions: 50
  };
  const parsed = workspaceAiPolicySchema.safeParse(rules.ai_policy || defaults);
  if (!parsed.success)
    throw new AppError(
      503,
      "WORKSPACE_AI_POLICY_INVALID",
      "Workspace AI policy requires administrator review."
    );
  return parsed.data;
};

const applyWorkspaceAiPolicy = async (db, globalPolicy, workspaceId = currentWorkspace()) => {
  if (!workspaceId) return globalPolicy;
  const restrictions = await readWorkspaceAiPolicy(db, workspaceId);
  return {
    ...globalPolicy,
    providerPolicies: globalPolicy.providerPolicies.map((policy) => ({
      ...policy,
      enabled: policy.enabled && restrictions.allowedProviders.includes(policy.provider)
    })),
    ...Object.fromEntries(
      ["dailyRunLimit", "maxPromptCharacters", "maxOutputTokens", "maxProposedActions"].map(
        (key) => [key, Math.min(globalPolicy[key], restrictions[key])]
      )
    )
  };
};

module.exports = { applyWorkspaceAiPolicy, readWorkspaceAiPolicy, workspaceAiPolicySchema };
