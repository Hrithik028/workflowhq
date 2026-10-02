const { createAiPlanner } = require("../src/lib/aiPlanner");
const {
  actionPlanJsonSchema,
  normalizeGeneratedActions
} = require("../src/lib/aiActionGeneration");

const actionPlan = {
  summary: "Update the reviewed ticket",
  actions: [
    {
      id: "update",
      type: "task.update",
      taskRef: 7,
      expectedVersion: 2,
      fields: { status: "in_progress" },
      evidenceIds: ["task:7"]
    }
  ]
};
const input = {
  provider: "openai",
  model: "budget-test",
  apiKey: "test-only-key",
  project: { id: 4, name: "WorkflowHQ" },
  goal: "Start the existing ticket",
  maxItems: 4,
  outputMode: "actions",
  projectContext: {
    prompt: "Untrusted records",
    sources: [{ id: "task:7" }],
    existingTasks: [{ id: 7, version: 2, criterionIds: [8], title: "Existing" }]
  }
};
const responseBody = (provider, plan) =>
  provider === "openai"
    ? { output: [{ content: [{ type: "output_text", text: JSON.stringify(plan) }] }] }
    : provider === "anthropic"
      ? { content: [{ type: "text", text: JSON.stringify(plan) }] }
      : { candidates: [{ content: { parts: [{ text: JSON.stringify(plan) }] } }] };

describe("AI action generation", () => {
  afterEach(() => globalThis.vi.unstubAllGlobals());
  const planner = createAiPlanner({ aiPlannerEnabled: true, aiPlannerTimeoutMs: 1000 });
  const mockProvider = (provider, plan) => {
    const fetchMock = globalThis.vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => responseBody(provider, plan) });
    globalThis.vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  };

  it.each(["openai", "anthropic", "google"])(
    "generates review-only actions using %s",
    async (provider) => {
      const fetchMock = mockProvider(provider, actionPlan);
      expect(await planner.preview({ ...input, provider })).toEqual(actionPlan);
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.model || fetchMock.mock.calls[0][0]).toContain("budget-test");
      const schema =
        provider === "openai"
          ? body.text.format.schema
          : provider === "google"
            ? body.generationConfig.responseJsonSchema
            : JSON.parse(body.system.split("schema: ")[1]);
      expect(schema.required).toEqual(["summary", "actions"]);
      expect(schema.properties.actions.maxItems).toBe(4);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  );

  it.each([
    { ...actionPlan.actions[0], taskRef: 99 },
    { ...actionPlan.actions[0], expectedVersion: 3 },
    { ...actionPlan.actions[0], type: "criterion.complete", fields: undefined, criterionId: 99 },
    { ...actionPlan.actions[0], fields: { parentRef: 99 } }
  ])("rejects invented targets or versions without retries", async (actionItem) => {
    const fetchMock = mockProvider("openai", { ...actionPlan, actions: [actionItem] });
    await expect(planner.preview(input)).rejects.toMatchObject({ code: "AI_PLAN_TARGET_INVALID" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects excess output instead of silently dropping reviewed actions", async () => {
    mockProvider("openai", {
      ...actionPlan,
      actions: [actionPlan.actions[0], { ...actionPlan.actions[0], id: "second" }]
    });
    await expect(planner.preview({ ...input, maxItems: 1 })).rejects.toMatchObject({
      code: "AI_PLAN_INVALID"
    });
  });

  it("validates criteria against their own ticket and rejects unprovided evidence", async () => {
    const complete = {
      id: "complete",
      type: "criterion.complete",
      taskRef: 7,
      expectedVersion: 2,
      criterionId: 8,
      evidenceIds: ["task:7"]
    };
    mockProvider("openai", { summary: "Complete reviewed criterion", actions: [complete] });
    expect((await planner.preview(input)).actions[0]).toEqual(complete);
    mockProvider("openai", {
      ...actionPlan,
      actions: [{ ...actionPlan.actions[0], evidenceIds: ["task:99"] }]
    });
    await expect(planner.preview(input)).rejects.toMatchObject({
      code: "AI_PLAN_EVIDENCE_INVALID"
    });
  });

  it("normalizes new-ticket references and rejects permanent deletion", async () => {
    const create = {
      id: "create",
      type: "task.create",
      tempId: "new:one",
      evidenceIds: [],
      fields: { title: "New ticket" }
    };
    const criterion = {
      id: "add",
      type: "criterion.add",
      taskRef: "new:one",
      expectedVersion: null,
      body: "Reviewed criterion",
      evidenceIds: []
    };
    mockProvider("openai", {
      summary: "Create a ticket and criterion",
      actions: [create, criterion]
    });
    const generated = await planner.preview(input);
    expect(generated.actions[1]).not.toHaveProperty("expectedVersion");
    expect(generated.actions[0].fields.status).toBe("todo");
    mockProvider("openai", {
      summary: "Delete ticket",
      actions: [{ ...actionPlan.actions[0], type: "task.delete" }]
    });
    await expect(planner.preview(input)).rejects.toMatchObject({ code: "AI_PLAN_INVALID" });
  });

  it("uses strict objects at every schema level and supports all nine bounded action types", () => {
    const schema = actionPlanJsonSchema(12);
    const inspect = (value) => {
      if (!value || typeof value !== "object") return;
      if (value.type === "object") {
        expect(value.additionalProperties).toBe(false);
        expect(value.required).toEqual(Object.keys(value.properties));
      }
      Object.values(value).forEach(inspect);
    };
    inspect(schema);
    const types = new Set(
      schema.properties.actions.items.anyOf.map((item) => item.properties.type.enum[0])
    );
    expect(types.size).toBe(9);
    expect(types.has("task.delete")).toBe(false);
    expect(
      normalizeGeneratedActions({ actions: [{ taskRef: "new:one", expectedVersion: null }] })
    ).toEqual({ actions: [{ taskRef: "new:one" }] });
  });

  it("rejects malformed action entries as invalid provider output", async () => {
    mockProvider("openai", { summary: "Malformed proposal", actions: [null] });
    await expect(planner.preview(input)).rejects.toMatchObject({ code: "AI_PLAN_INVALID" });
  });
});
