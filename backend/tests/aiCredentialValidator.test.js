const {
  createAiCredentialValidator,
  validationRequests
} = require("../src/lib/aiCredentialValidator");

describe("AI credential validation endpoints", () => {
  afterEach(() => globalThis.vi.restoreAllMocks());

  it.each([
    ["openai", "https://api.openai.com/v1/models"],
    ["anthropic", "https://api.anthropic.com/v1/models"],
    ["google", "https://generativelanguage.googleapis.com/v1beta/models"]
  ])("uses the fixed allowlisted %s endpoint", async (provider, expectedUrl) => {
    const fetchMock = globalThis.vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));
    const validator = createAiCredentialValidator({ aiCredentialValidationTimeoutMs: 1000 });

    await expect(validator.validate(provider, "private-provider-key")).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expectedUrl,
      expect.objectContaining({ method: "GET", redirect: "error" })
    );
    expect(validationRequests[provider]("private-provider-key").url).toBe(expectedUrl);
  });

  it("returns a redacted error when a provider rejects a key", async () => {
    globalThis.vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("provider echoed private-provider-key", { status: 401 }));
    const validator = createAiCredentialValidator({ aiCredentialValidationTimeoutMs: 1000 });

    await expect(validator.validate("openai", "private-provider-key")).rejects.toMatchObject({
      code: "AI_CREDENTIAL_INVALID",
      message: "The provider rejected that credential."
    });
  });
});
