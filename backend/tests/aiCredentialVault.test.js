const request = require("supertest");

const {
  decryptCredential,
  encryptCredential,
  loadCredential
} = require("../src/lib/aiCredentialVault");
const { auth, buildTestApp, registerUser } = require("./helpers/testApp");

const keyOne = Buffer.alloc(32, 11);
const keyTwo = Buffer.alloc(32, 22);
const vaultConfig = {
  aiCredentialVaultEnabled: true,
  aiCredentialMasterKeys: { 1: keyOne },
  aiCredentialActiveKeyVersion: 1,
  aiCredentialValidationTimeoutMs: 10000
};

describe("AI credential encryption", () => {
  it("round-trips with authenticated user and provider binding", () => {
    const encrypted = encryptCredential(
      { credential: "sk-private-round-trip", provider: "openai", userId: 7 },
      vaultConfig
    );
    const stored = {
      user_id: 7,
      provider: "openai",
      encryption_version: encrypted.encryptionVersion,
      key_version: encrypted.keyVersion,
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      auth_tag: encrypted.authTag
    };

    expect(decryptCredential(stored, vaultConfig)).toBe("sk-private-round-trip");
    expect(encrypted.ciphertext).not.toContain("sk-private-round-trip");
  });

  it("rejects tampering without returning cryptographic details", () => {
    const encrypted = encryptCredential(
      { credential: "sk-private-tamper-test", provider: "openai", userId: 7 },
      vaultConfig
    );
    const tampered = {
      user_id: 7,
      provider: "openai",
      encryption_version: 1,
      key_version: 1,
      ciphertext: `${encrypted.ciphertext.slice(0, -1)}${
        encrypted.ciphertext.endsWith("A") ? "B" : "A"
      }`,
      iv: encrypted.iv,
      auth_tag: encrypted.authTag
    };
    expect(() => decryptCredential(tampered, vaultConfig)).toThrow(
      "The saved provider credential failed its integrity check."
    );
  });

  it("keeps old keys readable during rotation and fails closed after premature retirement", () => {
    const oldRecord = encryptCredential(
      { credential: "sk-private-old-key", provider: "anthropic", userId: 9 },
      vaultConfig
    );
    const stored = {
      user_id: 9,
      provider: "anthropic",
      encryption_version: 1,
      key_version: oldRecord.keyVersion,
      ciphertext: oldRecord.ciphertext,
      iv: oldRecord.iv,
      auth_tag: oldRecord.authTag
    };
    const rotating = {
      ...vaultConfig,
      aiCredentialMasterKeys: { 1: keyOne, 2: keyTwo },
      aiCredentialActiveKeyVersion: 2
    };

    expect(decryptCredential(stored, rotating)).toBe("sk-private-old-key");
    expect(
      encryptCredential(
        { credential: "sk-private-new-key", provider: "anthropic", userId: 9 },
        rotating
      ).keyVersion
    ).toBe(2);
    expect(() =>
      decryptCredential(stored, { ...rotating, aiCredentialMasterKeys: { 2: keyTwo } })
    ).toThrow("cannot be read with the configured encryption keys");
  });
});

describe("AI credential API", () => {
  let app;
  let db;
  let user;
  let validator;

  beforeEach(async () => {
    validator = { validate: globalThis.vi.fn().mockResolvedValue(true) };
    ({ app, db } = await buildTestApp({
      config: vaultConfig,
      aiCredentialValidator: validator
    }));
    user = await registerUser(app, "credential-owner");
  });

  afterEach(async () => db.end());

  it("requires authentication and fails closed when the vault is disabled", async () => {
    expect((await request(app).get("/api/ai/credentials")).status).toBe(401);
    app.locals.config.aiCredentialVaultEnabled = false;
    const response = await request(app)
      .post("/api/ai/credentials")
      .set(auth(user.token))
      .send({ provider: "openai", credential: "sk-private-not-written" });

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("AI_CREDENTIAL_VAULT_NOT_CONFIGURED");
    expect((await db.query("SELECT * FROM ai_provider_credentials")).rows).toHaveLength(0);
  });

  it("validates without persisting and uses only the selected provider", async () => {
    const response = await request(app)
      .post("/api/ai/credentials/validate")
      .set(auth(user.token))
      .send({ provider: "google", credential: "private-validation-only" });

    expect(response.status).toBe(200);
    expect(validator.validate).toHaveBeenCalledWith("google", "private-validation-only");
    expect((await db.query("SELECT * FROM ai_provider_credentials")).rows).toHaveLength(0);
  });

  it("saves encrypted metadata, replaces it, and keeps audit records redacted", async () => {
    const saved = await request(app)
      .post("/api/ai/credentials")
      .set(auth(user.token))
      .send({ provider: "openai", credential: "sk-private-original-1234" });

    expect(saved.status).toBe(201);
    expect(saved.body.data).toMatchObject({
      provider: "openai",
      configured: true,
      maskedSuffix: "••••1234",
      keyVersion: 1
    });
    expect(JSON.stringify(saved.body)).not.toContain("sk-private-original");
    expect(
      await loadCredential(db, { provider: "openai", userId: user.user.id }, vaultConfig)
    ).toBe("sk-private-original-1234");

    const duplicate = await request(app)
      .post("/api/ai/credentials")
      .set(auth(user.token))
      .send({ provider: "openai", credential: "sk-private-duplicate" });
    expect(duplicate.status).toBe(409);

    const replaced = await request(app)
      .put("/api/ai/credentials/openai")
      .set(auth(user.token))
      .send({ credential: "sk-private-replacement-5678" });
    expect(replaced.status).toBe(200);
    expect(replaced.body.data.maskedSuffix).toBe("••••5678");
    expect(
      await loadCredential(db, { provider: "openai", userId: user.user.id }, vaultConfig)
    ).toBe("sk-private-replacement-5678");

    const audit = await db.query(
      "SELECT action, provider, key_version FROM ai_credential_audit_log ORDER BY id"
    );
    expect(audit.rows.map((row) => row.action)).toEqual([
      "credential_saved",
      "credential_replaced"
    ]);
    expect(JSON.stringify(audit.rows)).not.toContain("private");
  });

  it("isolates each user's list and supports deletion", async () => {
    await request(app)
      .post("/api/ai/credentials")
      .set(auth(user.token))
      .send({ provider: "anthropic", credential: "sk-ant-private-1234" });
    const other = await registerUser(app, "credential-other");

    const otherList = await request(app).get("/api/ai/credentials").set(auth(other.token));
    expect(otherList.body.data.every((item) => item.configured === false)).toBe(true);

    const removed = await request(app)
      .delete("/api/ai/credentials/anthropic")
      .set(auth(user.token));
    expect(removed.status).toBe(204);
    expect((await db.query("SELECT * FROM ai_provider_credentials")).rows).toHaveLength(0);
    expect(
      (await db.query("SELECT action FROM ai_credential_audit_log ORDER BY id DESC LIMIT 1"))
        .rows[0].action
    ).toBe("credential_removed");
  });
});
