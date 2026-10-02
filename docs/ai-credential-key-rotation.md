# AI credential master-key rotation and recovery

WorkflowHQ encrypts user-owned OpenAI, Anthropic, and Google Gemini credentials with AES-256-GCM.
Each row records its encryption-format version and master-key version. The key ring is a backend
secret and must never be added to source control, frontend variables, logs, support tickets, or
database backups.

## Initial setup

Generate 32 random bytes using an approved secret-management workstation, encode them as base64,
and store a versioned JSON object in the backend secret store:

```env
AI_CREDENTIAL_VAULT_ENABLED=true
AI_CREDENTIAL_MASTER_KEYS_JSON={"1":"<base64-encoded 32-byte key>"}
AI_CREDENTIAL_ACTIVE_KEY_VERSION=1
```

The service refuses to start when AI planning is enabled without the vault, when a configured key
does not decode to exactly 32 bytes, or when the active version is absent from the ring.

## Planned rotation

1. Back up the current secret-store value through the platform's protected recovery mechanism.
2. Generate a new independent 32-byte key. Never derive it from the previous key.
3. Add the new version while retaining every version still referenced by PostgreSQL, then make the
   new version active. For example:

   ```env
   AI_CREDENTIAL_MASTER_KEYS_JSON={"1":"<old-key>","2":"<new-key>"}
   AI_CREDENTIAL_ACTIVE_KEY_VERSION=2
   ```

4. Deploy and verify that list, validation, replacement, deletion, and AI preview checks pass.
5. New and replaced credentials now use version 2. Ask users with older rows to replace their
   saved credentials, and monitor only aggregate versions:

   ```sql
   SELECT key_version, COUNT(*) FROM ai_provider_credentials GROUP BY key_version;
   ```

6. Remove version 1 only after the query reports zero rows for it and protected backups no longer
   require it under the retention policy.

Never switch the active version and remove the old key in one deployment. Old rows fail closed and
cannot be recovered without their original key.

## Recovery

- If the active key is missing or malformed, disable `AI_PLANNER_ENABLED`, restore the exact key
  ring from the protected secret-store history, and redeploy. Do not ask users to send keys through
  chat or email.
- If an old key was retired too early, restore it under its original numeric version. Changing the
  version number will not work because it is authenticated with the ciphertext.
- If a key is believed compromised, disable AI planning, retain the suspect key only in an
  isolated recovery process long enough to decrypt and re-encrypt affected rows, rotate to a new
  version, and require users to replace provider credentials. Record the incident without copying
  ciphertext, tags, IVs, or provider secrets into logs.
- If the database ciphertext, IV, tag, owner, provider, or key version was modified, AES-GCM
  authentication fails. Replace that user's credential; do not bypass the integrity check.

Database backups do not contain the master keys and are insufficient on their own. The database
and key-ring backups must have separate access controls and compatible retention windows.
