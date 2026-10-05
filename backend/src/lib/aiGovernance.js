const { AppError } = require("./errors");

const supportedProviders = ["openai", "anthropic", "google"];

const defaultProviderPolicies = supportedProviders.map((provider) => ({
  provider,
  enabled: false,
  allowedModels: [],
  defaultModel: null
}));

const normalizeProviderPolicies = (value) => {
  const byProvider = new Map(
    (Array.isArray(value) ? value : []).map((policy) => [policy.provider, policy])
  );
  return defaultProviderPolicies.map((fallback) => {
    const policy = byProvider.get(fallback.provider) || fallback;
    const allowedModels = [
      ...new Set(
        (Array.isArray(policy.allowedModels) ? policy.allowedModels : [])
          .map((model) => String(model).trim())
          .filter(Boolean)
      )
    ].slice(0, 50);
    return {
      provider: fallback.provider,
      enabled: policy.enabled === true,
      allowedModels,
      defaultModel:
        policy.defaultModel && allowedModels.includes(policy.defaultModel)
          ? policy.defaultModel
          : allowedModels[0] || null
    };
  });
};

const serverCeilings = (config) => ({
  dailyRunLimit: config.aiDailyRunsMax,
  maxPromptCharacters: config.aiPromptCharactersMax,
  maxOutputTokens: config.aiOutputTokensMax,
  maxProposedActions: config.aiProposedActionsMax,
  requestTimeoutMs: config.aiTimeoutMsMax,
  retentionDays: config.aiUsageRetentionDaysMax
});

const readAiGovernance = async (db, config) => {
  const result = await db.query(
    `SELECT provider_policies, daily_run_limit, max_prompt_characters,
            max_output_tokens, max_proposed_actions, request_timeout_ms,
            retention_days, updated_by, updated_at
     FROM ai_governance_settings
     WHERE id = 1`
  );
  const row = result.rows[0];
  if (!row) {
    throw new AppError(503, "AI_GOVERNANCE_UNAVAILABLE", "AI governance is not configured.");
  }
  const limits = serverCeilings(config);
  const effectiveLimit = (key, value) => Math.min(Number(value), limits[key]);
  return {
    deploymentEnabled: config.aiPlannerEnabled === true,
    enforcementEnabled: true,
    providerPolicies: normalizeProviderPolicies(row.provider_policies),
    dailyRunLimit: effectiveLimit("dailyRunLimit", row.daily_run_limit),
    maxPromptCharacters: effectiveLimit("maxPromptCharacters", row.max_prompt_characters),
    maxOutputTokens: effectiveLimit("maxOutputTokens", row.max_output_tokens),
    maxProposedActions: effectiveLimit("maxProposedActions", row.max_proposed_actions),
    requestTimeoutMs: effectiveLimit("requestTimeoutMs", row.request_timeout_ms),
    retentionDays: effectiveLimit("retentionDays", row.retention_days),
    updatedBy: row.updated_by == null ? null : Number(row.updated_by),
    updatedAt: row.updated_at,
    serverCeilings: serverCeilings(config)
  };
};

const assertWithinServerCeilings = (settings, config) => {
  const ceilings = serverCeilings(config);
  for (const [key, maximum] of Object.entries(ceilings)) {
    if (settings[key] > maximum) {
      throw new AppError(
        422,
        "AI_GOVERNANCE_CEILING_EXCEEDED",
        `${key} cannot exceed the server-defined maximum of ${maximum}.`
      );
    }
  }
};

const updateAiGovernance = async (db, { settings, userId, config }) => {
  const normalized = {
    ...settings,
    providerPolicies: normalizeProviderPolicies(settings.providerPolicies)
  };
  assertWithinServerCeilings(normalized, config);
  const result = await db.query(
    `UPDATE ai_governance_settings
     SET provider_policies = $1::jsonb,
         daily_run_limit = $2,
         max_prompt_characters = $3,
         max_output_tokens = $4,
         max_proposed_actions = $5,
         request_timeout_ms = $6,
         retention_days = $7,
         updated_by = $8,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = 1
     RETURNING updated_at`,
    [
      JSON.stringify(normalized.providerPolicies),
      normalized.dailyRunLimit,
      normalized.maxPromptCharacters,
      normalized.maxOutputTokens,
      normalized.maxProposedActions,
      normalized.requestTimeoutMs,
      normalized.retentionDays,
      userId
    ]
  );
  if (!result.rows[0]) {
    throw new AppError(503, "AI_GOVERNANCE_UNAVAILABLE", "AI governance is not configured.");
  }
  return readAiGovernance(db, config);
};

const reserveAiPreview = async (
  db,
  { config, userId, provider, model, promptCharacters, maxItems }
) => {
  const policy = await readAiGovernance(db, config);
  const providerPolicy = policy.providerPolicies.find((item) => item.provider === provider);
  if (!providerPolicy?.enabled) {
    throw new AppError(403, "AI_PROVIDER_DISABLED", "That AI provider is disabled by policy.");
  }
  if (!providerPolicy.allowedModels.includes(model)) {
    throw new AppError(422, "AI_MODEL_NOT_ALLOWED", "That AI model is not allowed by policy.");
  }
  if (promptCharacters > policy.maxPromptCharacters) {
    throw new AppError(
      422,
      "AI_PROMPT_LIMIT_EXCEEDED",
      `This request exceeds the ${policy.maxPromptCharacters} character planning limit.`
    );
  }
  if (maxItems > policy.maxProposedActions) {
    throw new AppError(
      422,
      "AI_ACTION_LIMIT_EXCEEDED",
      `This request exceeds the ${policy.maxProposedActions} proposed-action limit.`
    );
  }
  const usageDate = new Date().toISOString().slice(0, 10);
  await db.query(
    `INSERT INTO ai_daily_usage (user_id, usage_date)
     VALUES ($1, $2)
     ON CONFLICT (user_id, usage_date) DO NOTHING`,
    [userId, usageDate]
  );
  const reserved = await db.query(
    `UPDATE ai_daily_usage
     SET run_count = run_count + 1,
         prompt_characters = prompt_characters + $3,
         updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $1 AND usage_date = $2 AND run_count < $4
     RETURNING run_count`,
    [userId, usageDate, promptCharacters, policy.dailyRunLimit]
  );
  if (!reserved.rows[0]) {
    throw new AppError(
      429,
      "AI_DAILY_QUOTA_EXCEEDED",
      `The daily AI planning limit of ${policy.dailyRunLimit} runs has been reached.`
    );
  }
  return { enabled: true, policy, usageDate };
};

const completeAiPreviewUsage = async (
  db,
  { userId, usageDate, estimatedOutputTokens, proposedActions }
) => {
  if (!usageDate) return;
  await db.query(
    `UPDATE ai_daily_usage
     SET estimated_output_tokens = estimated_output_tokens + $3,
         proposed_actions = proposed_actions + $4,
         updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $1 AND usage_date = $2`,
    [userId, usageDate, estimatedOutputTokens, proposedActions]
  );
};

const safeErrorCode = (error, outcome) => {
  if (outcome === "succeeded") return null;
  const value = typeof error?.code === "string" ? error.code : "AI_INTERNAL_ERROR";
  return /^[A-Z0-9_]{1,80}$/u.test(value) ? value : "AI_INTERNAL_ERROR";
};

const recordAiUsageEvent = async (
  db,
  {
    userId,
    projectId,
    provider,
    model,
    operation = "preview",
    outcome,
    error,
    promptCharacters = 0,
    estimatedOutputTokens = 0,
    proposedActions = 0,
    latencyMs = 0
  }
) =>
  db.query(
    `INSERT INTO ai_usage_events (
       user_id, project_id, provider, model, operation, outcome, error_code,
       prompt_characters, estimated_output_tokens, proposed_actions, latency_ms
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      userId,
      projectId,
      provider,
      model,
      operation,
      outcome,
      safeErrorCode(error, outcome),
      promptCharacters,
      estimatedOutputTokens,
      proposedActions,
      Math.max(0, Math.round(latencyMs))
    ]
  );

const pruneAiUsage = async (db, retentionDays) => {
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
  const usageDate = cutoff.toISOString().slice(0, 10);
  await db.query("DELETE FROM ai_usage_events WHERE created_at < $1", [cutoff]);
  await db.query("DELETE FROM ai_daily_usage WHERE usage_date < $1", [usageDate]);
};

const readAiUsageSummary = async (db) => {
  const since = new Date(Date.now() - 86_400_000);
  const events = (
    await db.query(
      `SELECT provider, outcome, error_code, latency_ms, created_at
       FROM ai_usage_events
       WHERE created_at >= $1
       ORDER BY created_at DESC
       LIMIT 2000`,
      [since]
    )
  ).rows;
  const providerHealth = supportedProviders.map((provider) => {
    // Local policy denials did not contact the provider and are not outages.
    const providerEvents = events.filter(
      (event) => event.provider === provider && event.outcome !== "denied"
    );
    const succeeded = providerEvents.filter((event) => event.outcome === "succeeded").length;
    const failed = providerEvents.length - succeeded;
    const lastFailure = providerEvents.find((event) => event.outcome !== "succeeded");
    const averageLatencyMs = providerEvents.length
      ? Math.round(
          providerEvents.reduce((total, event) => total + Number(event.latency_ms || 0), 0) /
            providerEvents.length
        )
      : 0;
    return {
      provider,
      status: providerEvents.length === 0 ? "unknown" : failed > succeeded ? "degraded" : "healthy",
      succeeded,
      failed,
      averageLatencyMs,
      lastFailureCode: lastFailure?.error_code || null,
      lastFailureAt: lastFailure?.created_at || null
    };
  });
  return {
    windowHours: 24,
    totalRuns: events.length,
    succeededRuns: events.filter((event) => event.outcome === "succeeded").length,
    failedRuns: events.filter((event) => event.outcome !== "succeeded").length,
    providerHealth
  };
};

module.exports = {
  completeAiPreviewUsage,
  defaultProviderPolicies,
  normalizeProviderPolicies,
  pruneAiUsage,
  readAiGovernance,
  readAiUsageSummary,
  recordAiUsageEvent,
  reserveAiPreview,
  supportedProviders,
  updateAiGovernance
};
