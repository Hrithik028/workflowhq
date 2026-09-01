const { createHash, createHmac, timingSafeEqual } = require("node:crypto");

const SIGNATURE_PATTERN = /^sha256=([0-9a-f]{64})$/;

const payloadSha256 = (rawBody) => createHash("sha256").update(rawBody).digest("hex");

const verifyGithubWebhookSignature = ({ rawBody, signature, secret }) => {
  if (!Buffer.isBuffer(rawBody) || typeof secret !== "string" || secret.length === 0) return false;
  const match = typeof signature === "string" ? SIGNATURE_PATTERN.exec(signature) : null;
  if (!match) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const received = Buffer.from(match[1], "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
};

module.exports = { payloadSha256, verifyGithubWebhookSignature };
