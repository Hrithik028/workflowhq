const { safeErrorForLog } = require("../src/middleware/errorMiddleware");

describe("AI error redaction", () => {
  it.each([
    "/api/ai/credentials",
    "/api/ai/credentials/validate",
    "/api/projects/7/ai-plan/preview"
  ])(
    "never logs error text for sensitive route %s",
    (path) => {
      const secret = "provider-secret-value-that-must-not-be-logged";
      const logged = safeErrorForLog(
        new Error(`Upstream echoed ${secret}`),
        { path },
        "INTERNAL_ERROR"
      );

      expect(logged).toBe("INTERNAL_ERROR");
      expect(logged).not.toContain(secret);
    }
  );
});
