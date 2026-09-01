const { AppError } = require("../lib/errors");
const { payloadSha256, verifyGithubWebhookSignature } = require("../lib/githubWebhookSecurity");
const { processGithubWebhook } = require("../lib/githubWebhookService");

const DELIVERY_PATTERN = /^[A-Za-z0-9-]{1,100}$/;
const EVENT_PATTERN = /^[a-z0-9_]{1,100}$/;

const receiveGithubWebhook = async (req, res) => {
  if (!Buffer.isBuffer(req.body)) {
    throw new AppError(
      415,
      "GITHUB_WEBHOOK_CONTENT_TYPE",
      "A raw JSON webhook payload is required."
    );
  }
  const deliveryId = req.get("x-github-delivery");
  const eventName = req.get("x-github-event")?.toLowerCase();
  const signature = req.get("x-hub-signature-256");
  if (!DELIVERY_PATTERN.test(deliveryId || "") || !EVENT_PATTERN.test(eventName || "")) {
    throw new AppError(
      400,
      "GITHUB_WEBHOOK_HEADERS_INVALID",
      "Valid GitHub delivery and event headers are required."
    );
  }
  const config = req.app.locals.config;
  const secret = config?.githubWebhookSecret;
  if (!config?.githubIntegrationEnabled || !secret) {
    throw new AppError(
      503,
      "GITHUB_WEBHOOK_UNAVAILABLE",
      "GitHub webhook processing is unavailable."
    );
  }
  if (!verifyGithubWebhookSignature({ rawBody: req.body, signature, secret })) {
    throw new AppError(
      401,
      "GITHUB_WEBHOOK_SIGNATURE_INVALID",
      "Webhook signature verification failed."
    );
  }

  let payload;
  try {
    payload = JSON.parse(req.body.toString("utf8"));
  } catch {
    throw new AppError(
      400,
      "GITHUB_WEBHOOK_JSON_INVALID",
      "The webhook payload is not valid JSON."
    );
  }
  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    throw new AppError(
      400,
      "GITHUB_WEBHOOK_JSON_INVALID",
      "The webhook payload must be an object."
    );
  }

  const result = await processGithubWebhook({
    db: req.app.locals.db,
    deliveryId,
    eventName,
    payload,
    payloadHash: payloadSha256(req.body)
  });
  return res.status(result.duplicate ? 200 : 202).json({
    data: { deliveryId, duplicate: result.duplicate, status: result.status }
  });
};

module.exports = { receiveGithubWebhook };
