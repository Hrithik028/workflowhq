const { createAiPlanner } = require("../src/lib/aiPlanner");

const taskPlan = {
  summary: "A bounded implementation plan.",
  tasks: [
    {
      tempId: "task-1",
      parentTempId: null,
      taskType: "task",
      title: "Implement the bounded change",
      description: "Deliver and verify the requested behavior.",
      priority: "medium",
      dueDate: null,
      acceptanceCriteria: ["The requested behavior is covered by tests."]
    }
  ]
};

const input = {
  apiKey: "request-scoped-provider-secret",
  model: "provider-model",
  goal: "Create a safe task plan for a bounded implementation.",
  context: "Preview before applying.",
  maxItems: 5,
  project: { name: "WorkflowHQ", description: "Developer delivery platform" }
};

describe("AI planner provider adapters", () => {
  afterEach(() => globalThis.vi.restoreAllMocks());

  it.each([
    [
      "openai",
      { output: [{ content: [{ type: "output_text", text: JSON.stringify(taskPlan) }] }] },
      "https://api.openai.com/v1/responses"
    ],
    [
      "anthropic",
      { content: [{ type: "text", text: JSON.stringify(taskPlan) }] },
      "https://api.anthropic.com/v1/messages"
    ],
    [
      "google",
      { candidates: [{ content: { parts: [{ text: JSON.stringify(taskPlan) }] } }] },
      "https://generativelanguage.googleapis.com/v1beta/models/provider-model:generateContent"
    ]
  ])("validates a %s structured response from its fixed endpoint", async (provider, body, url) => {
    const fetchMock = globalThis.vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
    const planner = createAiPlanner({ aiPlannerEnabled: true, aiPlannerTimeoutMs: 1000 });

    await expect(planner.preview({ ...input, provider })).resolves.toEqual(taskPlan);
    expect(fetchMock).toHaveBeenCalledWith(url, expect.objectContaining({ method: "POST" }));
  });
});
