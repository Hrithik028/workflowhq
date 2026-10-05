const { AppError } = require("./errors");
const { buildPlanningPrompt } = require("./aiPlanner");
const { reserveAiPreview, completeAiPreviewUsage, recordAiUsageEvent } = require("./aiGovernance");

// One generation boundary for direct previews and both conversation modes.
const createGovernedAiPlanner = ({ db, config, planner }) => ({
  providers: planner.providers,
  async preview(input) {
    if (!Number.isSafeInteger(input.governanceUserId) || input.governanceUserId < 1) {
      throw new AppError(
        403,
        "AI_GOVERNANCE_CONTEXT_REQUIRED",
        "Authenticated AI context is required."
      );
    }
    const startedAt = Date.now();
    const promptCharacters = buildPlanningPrompt(input).length;
    const metadata = {
      userId: input.governanceUserId,
      projectId: input.project.id,
      provider: input.provider,
      model: input.model,
      promptCharacters
    };
    let reservation;
    try {
      reservation = await reserveAiPreview(db, { ...metadata, config, maxItems: input.maxItems });
      const policy = reservation.policy;
      const plan = await planner.preview({
        ...input,
        runtimeLimits: {
          maxOutputTokens: policy.maxOutputTokens,
          requestTimeoutMs: Math.min(policy.requestTimeoutMs, config.aiPlannerTimeoutMs)
        }
      });
      const proposedActions = (plan.actions || plan.tasks).length;
      if (proposedActions > policy.maxProposedActions || proposedActions > input.maxItems) {
        throw new AppError(
          502,
          "AI_ACTION_LIMIT_EXCEEDED",
          "The model exceeded the allowed proposal size."
        );
      }
      // A display estimate, never token billing or quota enforcement.
      const estimatedOutputTokens = Math.ceil(JSON.stringify(plan).length / 4);
      await completeAiPreviewUsage(db, {
        ...metadata,
        usageDate: reservation.usageDate,
        estimatedOutputTokens,
        proposedActions
      });
      await recordAiUsageEvent(db, {
        ...metadata,
        estimatedOutputTokens,
        proposedActions,
        outcome: "succeeded",
        latencyMs: Date.now() - startedAt
      });
      return plan;
    } catch (error) {
      await recordAiUsageEvent(db, {
        ...metadata,
        error,
        outcome: reservation ? "failed" : "denied",
        latencyMs: Date.now() - startedAt
      });
      throw error;
    }
  }
});

module.exports = { createGovernedAiPlanner };
