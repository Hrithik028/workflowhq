const {
  pruneAiUsage,
  readAiGovernance,
  readAiUsageSummary,
  updateAiGovernance
} = require("../lib/aiGovernance");

const getAiGovernance = async (req, res) => {
  const db = req.app.locals.db;
  const settings = await readAiGovernance(db, req.app.locals.config);
  await pruneAiUsage(db, settings.retentionDays);
  const usage = await readAiUsageSummary(db);
  return res.status(200).json({ data: { settings, usage } });
};

const updateAiGovernanceSettings = async (req, res) => {
  const db = req.app.locals.db;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const settings = await updateAiGovernance(client, {
      settings: req.body,
      userId: req.user.id,
      config: req.app.locals.config
    });
    await client.query(
      `INSERT INTO admin_audit_log (admin_user_id, action, details)
       VALUES ($1, 'ai_governance_updated', $2)`,
      [
        req.user.id,
        JSON.stringify({
          enabledProviders: settings.providerPolicies
            .filter((policy) => policy.enabled)
            .map((policy) => policy.provider),
          modelCounts: Object.fromEntries(
            settings.providerPolicies.map((policy) => [
              policy.provider,
              policy.allowedModels.length
            ])
          ),
          dailyRunLimit: settings.dailyRunLimit,
          maxPromptCharacters: settings.maxPromptCharacters,
          maxOutputTokens: settings.maxOutputTokens,
          maxProposedActions: settings.maxProposedActions,
          requestTimeoutMs: settings.requestTimeoutMs,
          retentionDays: settings.retentionDays
        })
      ]
    );
    await pruneAiUsage(client, settings.retentionDays);
    await client.query("COMMIT");
    const usage = await readAiUsageSummary(db);
    return res.status(200).json({ data: { settings, usage } });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

module.exports = { getAiGovernance, updateAiGovernanceSettings };
