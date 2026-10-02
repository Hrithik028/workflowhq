const {
  safeErrorForLog,
  safeAiPlanDiagnostics,
  errorHandler
} = require("../src/middleware/errorMiddleware");
const { AppError } = require("../src/lib/errors");

describe("AI error redaction", () => {
  it.each([
    "/api/ai/credentials",
    "/api/ai/credentials/validate",
    "/api/projects/7/ai-plan/preview",
    "/api/projects/7/ai-conversations/conversation-id/runs",
    "/projects/7/ai-conversations/conversation-id/runs"
  ])("never logs error text for sensitive route %s", (path) => {
    const secret = "provider-secret-value-that-must-not-be-logged";
    const logged = safeErrorForLog(
      new Error(`Upstream echoed ${secret}`),
      { path },
      "INTERNAL_ERROR"
    );

    expect(logged).toBe("INTERNAL_ERROR");
    expect(logged).not.toContain(secret);
  });

  it("allowlists diagnostics and exposes a fixed safe AI error instead of raw model content", () => {
    const secret = "private-model-value";
    const error = new AppError(502, "AI_PLAN_INVALID", secret, {
      stage: "schema_validation",
      issues: [{ path: `tasks.0.${secret}`, code: secret, message: secret, input: secret }],
      response: secret
    });
    expect(safeAiPlanDiagnostics(error)).toEqual({
      stage: "schema_validation",
      issues: [{ path: "tasks.0.field", code: "invalid_value" }]
    });
    const res = { status: globalThis.vi.fn().mockReturnThis(), json: globalThis.vi.fn() };
    errorHandler(
      error,
      {
        path: "/api/projects/7/ai-conversations/id/runs",
        app: { locals: { config: { nodeEnv: "test" } } }
      },
      res
    );
    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json.mock.calls[0][0].error.message).toContain("No tickets were created");
    expect(JSON.stringify(res.json.mock.calls)).not.toContain(secret);
    const stderr = globalThis.vi.spyOn(process.stderr, "write").mockReturnValue(true);
    try {
      errorHandler(
        error,
        {
          id: "fixture-request-id",
          method: "POST",
          path: "/api/projects/7/ai-conversations/id/runs",
          app: { locals: { config: { nodeEnv: "production" } } }
        },
        res
      );
      const log = JSON.parse(stderr.mock.calls[0][0]);
      expect(log.error).toBe("AI_PLAN_INVALID");
      expect(log.validation).toEqual(safeAiPlanDiagnostics(error));
      expect(JSON.stringify(log)).not.toContain(secret);
    } finally {
      stderr.mockRestore();
    }
  });
});
