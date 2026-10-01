const { AppError } = require("./errors");

const validationRequests = {
  openai: (apiKey) => ({
    url: "https://api.openai.com/v1/models",
    headers: { authorization: `Bearer ${apiKey}` }
  }),
  anthropic: (apiKey) => ({
    url: "https://api.anthropic.com/v1/models",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" }
  }),
  google: (apiKey) => ({
    url: "https://generativelanguage.googleapis.com/v1beta/models",
    headers: { "x-goog-api-key": apiKey }
  })
};

const buildValidationRequest = (provider, apiKey) => {
  if (provider === "openai") return validationRequests.openai(apiKey);
  if (provider === "anthropic") return validationRequests.anthropic(apiKey);
  if (provider === "google") return validationRequests.google(apiKey);
  return null;
};

const createAiCredentialValidator = (config) => ({
  async validate(provider, apiKey) {
    const request = buildValidationRequest(provider, apiKey);
    if (!request) {
      throw new AppError(422, "AI_PROVIDER_UNSUPPORTED", "That AI provider is not supported.");
    }
    let response;
    try {
      response = await fetch(request.url, {
        method: "GET",
        headers: request.headers,
        redirect: "error",
        signal: AbortSignal.timeout(config.aiCredentialValidationTimeoutMs)
      });
    } catch {
      throw new AppError(
        502,
        "AI_PROVIDER_UNAVAILABLE",
        "The provider credential could not be validated right now."
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new AppError(422, "AI_CREDENTIAL_INVALID", "The provider rejected that credential.");
    }
    if (!response.ok) {
      throw new AppError(
        502,
        "AI_PROVIDER_UNAVAILABLE",
        "The provider credential could not be validated right now."
      );
    }
    return true;
  }
});

module.exports = { buildValidationRequest, createAiCredentialValidator, validationRequests };
