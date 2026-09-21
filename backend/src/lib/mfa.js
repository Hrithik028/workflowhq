const {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual
} = require("node:crypto");

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

const encodeBase32 = (buffer) => {
  let bits = "";
  for (const byte of buffer) bits += byte.toString(2).padStart(8, "0");
  let encoded = "";
  for (let index = 0; index < bits.length; index += 5) {
    encoded += BASE32_ALPHABET[Number.parseInt(bits.slice(index, index + 5).padEnd(5, "0"), 2)];
  }
  return encoded;
};

const decodeBase32 = (value) => {
  const normalized = value.toUpperCase().replace(/=+$/u, "");
  let bits = "";
  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index === -1) throw new Error("Invalid base32 secret.");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
};

const generateMfaSecret = () => encodeBase32(randomBytes(20));

const generateTotp = (secret, timestamp = Date.now()) => {
  const counter = BigInt(Math.floor(timestamp / 30_000));
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(counter);
  const digest = createHmac("sha1", decodeBase32(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
};

const matchTotpStep = (secret, candidate, timestamp = Date.now()) => {
  if (!/^\d{6}$/u.test(candidate)) return null;
  const currentStep = Math.floor(timestamp / 30_000);
  for (const window of [-1, 0, 1]) {
    const expected = Buffer.from(generateTotp(secret, (currentStep + window) * 30_000));
    const supplied = Buffer.from(candidate);
    if (expected.length === supplied.length && timingSafeEqual(expected, supplied)) {
      return currentStep + window;
    }
  }
  return null;
};

const getEncryptionKey = (config) => {
  const key = Buffer.from(config.accountEncryptionKeyBase64 || "", "base64");
  if (key.length !== 32) throw new Error("A 32-byte account encryption key is required for MFA.");
  return key;
};

const encryptSecret = (secret, config) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(config), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((part) => part.toString("base64url")).join(".");
};

const decryptSecret = (value, config) => {
  const [ivValue, tagValue, ciphertextValue] = value.split(".");
  if (!ivValue || !tagValue || !ciphertextValue)
    throw new Error("Encrypted MFA secret is invalid.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(config),
    Buffer.from(ivValue, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final()
  ]).toString("utf8");
};

const normalizeRecoveryCode = (code) => code.toUpperCase().replace(/[^A-Z0-9]/gu, "");
const hashRecoveryCode = (code) =>
  createHash("sha256").update(normalizeRecoveryCode(code)).digest("hex");
const generateRecoveryCodes = () =>
  Array.from({ length: 10 }, () => {
    const value = randomBytes(6).toString("hex").toUpperCase();
    return `WHQ-${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8)}`;
  });

const createOtpAuthUri = ({ secret, email }) =>
  `otpauth://totp/${encodeURIComponent(`WorkflowHQ:${email}`)}?secret=${secret}&issuer=${encodeURIComponent("WorkflowHQ")}&algorithm=SHA1&digits=6&period=30`;

module.exports = {
  createOtpAuthUri,
  decryptSecret,
  encryptSecret,
  generateMfaSecret,
  generateRecoveryCodes,
  generateTotp,
  hashRecoveryCode,
  matchTotpStep
};
