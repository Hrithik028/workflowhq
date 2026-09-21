const { resolveRequestId } = require("../src/middleware/requestLogger");

describe("request ID validation", () => {
  it("preserves a valid caller-supplied request ID", () => {
    expect(resolveRequestId("edge-01:request_123.trace")).toBe("edge-01:request_123.trace");
  });

  it.each([undefined, "", "contains spaces", "line\nbreak", "x".repeat(129)])(
    "replaces an invalid request ID (%s)",
    (candidate) => {
      const requestId = resolveRequestId(candidate);

      expect(requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      );
    }
  );
});
