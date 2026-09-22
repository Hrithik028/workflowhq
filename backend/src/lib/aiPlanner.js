const { AppError } = require("./errors");
const { aiPlannerSchemas } = require("../validation/aiPlannerSchemas");

const taskPlanJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "tasks"],
  properties: {
    summary: { type: "string" },
    tasks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "tempId",
          "parentTempId",
          "taskType",
          "title",
          "description",
          "priority",
          "dueDate",
          "acceptanceCriteria"
        ],
        properties: {
          tempId: { type: "string" },
          parentTempId: { type: ["string", "null"] },
          taskType: {
            type: "string",
            enum: ["initiative", "epic", "story", "task", "bug", "subtask"]
          },
          title: { type: "string" },
          description: { type: "string" },
          priority: { type: "string", enum: ["low", "medium", "high"] },
          dueDate: { anyOf: [{ type: "string" }, { type: "null" }] },
          acceptanceCriteria: { type: "array", items: { type: "string" } }
        }
      }
    }
  }
};

const parseJson = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    throw new AppError(502, "AI_PLAN_INVALID", "The selected model returned an invalid task plan.");
  }
};

const requestJson = async ({ url, headers, body, timeoutMs }) => {
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch {
    throw new AppError(
      502,
      "AI_PROVIDER_UNAVAILABLE",
      "The selected AI provider could not be reached."
    );
  }
  if (!response.ok) {
    throw new AppError(
      response.status === 401 ? 401 : 502,
      response.status === 401 ? "AI_CREDENTIAL_INVALID" : "AI_PROVIDER_ERROR",
      response.status === 401
        ? "The provider rejected that API key."
        : "The selected AI provider could not generate a plan."
    );
  }
  return response.json();
};

const adapters = {
  openai: async ({ apiKey, model, prompt, timeoutMs }) => {
    const data = await requestJson({
      url: "https://api.openai.com/v1/responses",
      headers: { authorization: `Bearer ${apiKey}` },
      timeoutMs,
      body: {
        model,
        store: false,
        instructions:
          "Return a practical software delivery plan. Never claim tickets were created.",
        input: prompt,
        text: {
          format: {
            type: "json_schema",
            name: "workflowhq_task_plan",
            strict: true,
            schema: taskPlanJsonSchema
          }
        }
      }
    });
    const text = data.output
      ?.flatMap((item) => item.content || [])
      .find((item) => item.type === "output_text")?.text;
    return parseJson(text || "");
  },
  anthropic: async ({ apiKey, model, prompt, timeoutMs }) => {
    const data = await requestJson({
      url: "https://api.anthropic.com/v1/messages",
      headers: { authorization: `Bearer ${apiKey}`, "anthropic-version": "2023-06-01" },
      timeoutMs,
      body: {
        model,
        max_tokens: 5000,
        system: `Return only JSON matching this schema: ${JSON.stringify(taskPlanJsonSchema)}`,
        messages: [{ role: "user", content: prompt }]
      }
    });
    return parseJson(data.content?.find((item) => item.type === "text")?.text || "");
  },
  google: async ({ apiKey, model, prompt, timeoutMs }) => {
    const data = await requestJson({
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      headers: { "x-goog-api-key": apiKey },
      timeoutMs,
      body: {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseJsonSchema: taskPlanJsonSchema
        }
      }
    });
    return parseJson(data.candidates?.[0]?.content?.parts?.[0]?.text || "");
  }
};

const createAiPlanner = (config) => ({
  providers: Object.keys(adapters),
  async preview(input) {
    if (!config.aiPlannerEnabled)
      throw new AppError(
        503,
        "AI_PLANNER_DISABLED",
        "AI task planning is not enabled on this deployment."
      );
    const adapter = adapters[input.provider];
    if (!adapter)
      throw new AppError(422, "AI_PROVIDER_UNSUPPORTED", "That AI provider is not supported.");
    const prompt = [
      `Project: ${input.project.name}`,
      input.project.description ? `Project context: ${input.project.description}` : "",
      `Goal: ${input.goal}`,
      input.context ? `Additional context: ${input.context}` : "",
      `Create no more than ${input.maxItems} work items. Use stable temporary IDs and parentTempId links. Include concise acceptance criteria. Use an ISO YYYY-MM-DD dueDate when the context provides a real deadline; otherwise use null.`
    ]
      .filter(Boolean)
      .join("\n\n");
    const result = await adapter({ ...input, prompt, timeoutMs: config.aiPlannerTimeoutMs });
    const limited = { ...result, tasks: result.tasks?.slice(0, input.maxItems) };
    const parsed = aiPlannerSchemas.plan.safeParse(limited);
    if (!parsed.success)
      throw new AppError(
        502,
        "AI_PLAN_INVALID",
        "The selected model returned a plan that WorkflowHQ could not safely validate."
      );
    return parsed.data;
  }
});

module.exports = { createAiPlanner };
