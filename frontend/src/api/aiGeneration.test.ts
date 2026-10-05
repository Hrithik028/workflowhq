import { afterEach, describe, expect, it, vi } from "vitest";

import { api, AI_GENERATION_TIMEOUT_MS } from "./client";
import { aiConversationsApi } from "./aiConversations";
import { aiPlannerApi } from "./aiPlanner";

describe("AI generation request budgets", () => {
  const planningInput = {
    goal: "Disposable QA",
    maxItems: 1,
    contextOptions: { includeProjectTasks: true, includeGithubActivity: false, repositoryIds: [] }
  };
  afterEach(() => vi.restoreAllMocks());

  it("allows conversation generation to outlast the provider deadline", async () => {
    const proposal = { id: "proposal" };
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: { data: { proposal } } });
    const input = { ...planningInput, outputMode: "actions" as const };
    expect(await aiConversationsApi.run(6, "conversation", input)).toBe(proposal);
    expect(post).toHaveBeenCalledWith("/projects/6/ai-conversations/conversation/runs", input, {
      timeout: AI_GENERATION_TIMEOUT_MS
    });
    expect(AI_GENERATION_TIMEOUT_MS).toBeGreaterThan(60_000);
    expect(api.defaults.timeout).toBe(12_000);
  });

  it("uses the same bounded deadline for direct preview", async () => {
    const preview = { approvalId: "approval" };
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: { data: preview } });
    const input = { ...planningInput, provider: "openai" as const, model: "budget" };
    expect(await aiPlannerApi.preview(6, input)).toBe(preview);
    expect(post).toHaveBeenCalledWith("/projects/6/ai-plan/preview", input, {
      timeout: AI_GENERATION_TIMEOUT_MS
    });
  });

  it("does not retry a timed-out generation", async () => {
    const post = vi.spyOn(api, "post").mockRejectedValue(new Error("timeout"));
    await expect(aiConversationsApi.run(6, "conversation", planningInput)).rejects.toThrow(
      "timeout"
    );
    expect(post).toHaveBeenCalledTimes(1);
  });
});
