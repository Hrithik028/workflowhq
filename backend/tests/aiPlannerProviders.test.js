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
      evidenceIds: [],
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
  project: { name: "WorkflowHQ", description: "Developer delivery platform" },
  projectContext: { prompt: "", sources: [] }
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
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    const schema =
      provider === "openai"
        ? sent.text.format.schema
        : provider === "google"
          ? sent.generationConfig.responseJsonSchema
          : JSON.parse(sent.system.replace("Return only JSON matching this schema: ", ""));
    expect(schema.properties.tasks).toMatchObject({ minItems: 1, maxItems: input.maxItems });
    expect(schema.properties.tasks.items.properties.tempId).toMatchObject({
      maxLength: 40,
      pattern: "^[A-Za-z0-9_-]+$"
    });
    expect(schema.properties.tasks.items.properties.evidenceIds.items.pattern).toBe(
      "^(?:task|github):\\d+$"
    );
    expect(JSON.stringify(sent)).toContain("never an existing project ticket key");
  });

  it.each([
    ["parentTempId", "WHQ-7", "custom"],
    ["dueDate", "", "invalid_format"],
    ["tempId", "secret value with spaces", "invalid_format"],
    ["title", "s".repeat(201), "too_big"],
    ["evidenceIds", ["WHQ-7"], "invalid_format"],
    ["acceptanceCriteria", [""], "too_small"]
  ])("reports only safe validation metadata for invalid %s", async (field, value, code) => {
    const invalid = { ...taskPlan, tasks: [{ ...taskPlan.tasks[0], [field]: value }] };
    const fetchMock = globalThis.vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          output: [{ content: [{ type: "output_text", text: JSON.stringify(invalid) }] }]
        })
      )
    );
    const planner = createAiPlanner({ aiPlannerEnabled: true, aiPlannerTimeoutMs: 1000 });
    await expect(planner.preview({ ...input, provider: "openai" })).rejects.toMatchObject({
      code: "AI_PLAN_INVALID",
      details: {
        stage: "schema_validation",
        issues: expect.arrayContaining([
          { path: expect.stringContaining(`tasks.0.${field}`), code }
        ])
      }
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects excess tasks without truncating or making a paid automatic retry", async () => {
    const fetchMock = globalThis.vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          output: [
            {
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    ...taskPlan,
                    tasks: [taskPlan.tasks[0], { ...taskPlan.tasks[0], tempId: "task-2" }]
                  })
                }
              ]
            }
          ]
        })
      )
    );
    await expect(
      createAiPlanner({ aiPlannerEnabled: true, aiPlannerTimeoutMs: 1000 }).preview({
        ...input,
        provider: "openai",
        maxItems: 1
      })
    ).rejects.toMatchObject({
      code: "AI_PLAN_INVALID",
      details: { stage: "item_limit" }
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not expose malformed provider output in JSON parse diagnostics", async () => {
    const secret = "private-provider-response";
    globalThis.vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          output: [{ content: [{ type: "output_text", text: secret }] }]
        })
      )
    );
    const planner = createAiPlanner({ aiPlannerEnabled: true, aiPlannerTimeoutMs: 1000 });
    const error = await planner.preview({ ...input, provider: "openai" }).catch((err) => err);
    expect(error.details).toEqual({ stage: "json_parse" });
    expect(JSON.stringify(error)).not.toContain(secret);
  });

  it("rejects evidence IDs that were not supplied by WorkflowHQ", async () => {
    const invalidPlan = {
      ...taskPlan,
      tasks: [{ ...taskPlan.tasks[0], evidenceIds: ["github:999"] }]
    };
    globalThis.vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          output: [{ content: [{ type: "output_text", text: JSON.stringify(invalidPlan) }] }]
        }),
        { status: 200 }
      )
    );
    const planner = createAiPlanner({ aiPlannerEnabled: true, aiPlannerTimeoutMs: 1000 });

    await expect(planner.preview({ ...input, provider: "openai" })).rejects.toMatchObject({
      code: "AI_PLAN_EVIDENCE_INVALID"
    });
  });
});
