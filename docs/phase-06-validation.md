# Phase 6 validation — 2026-10-02

## Release scope

Persistent project AI conversations, bounded message/run/revision history, proposal diffs,
evidence summaries, approval/discard controls, and retention cleanup. Conversation runs
use the user's encrypted provider credential from Phase 5. Migration 027 follows the
already deployed credential migration 026. Project and conversation list regressions
are covered. Planning-disabled and missing-credential paths fail without creating work.

The shared model picker starts with a budget-oriented provider model and allows an
explicit custom model ID. Provider changes reset to the budget default. Existing
conversations keep their pinned provider/model; start another conversation to change them.
No automatic upgrade to a more expensive model is performed. Cheaper per-token prices
do not guarantee fewer tokens, and availability depends on the provider account.

Default-model documentation checked on this date:

- https://developers.openai.com/api/docs/models/gpt-5.6-luna
- https://platform.claude.com/docs/en/models/overview
- https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-lite

## Browser checks

Production Phase 5: credential page loads for the signed-in user. User saved their own
OpenAI credential; only the masked suffix appeared, and it remained masked after reload.
The real credential was not read, replaced or removed. Provider validation and live
model generation were not performed by this test.

Phase 6 local testing used a disposable pg-mem database and fake provider, not production:

- Login and project register load with project metadata.
- Create conversation, generate successive revisions, inspect retained messages/history.
- Prior revision is superseded and loses its approval control.
- Approve latest revision; exactly one ticket appears with its acceptance criterion.
- Generate/discard another revision; discard creates no additional ticket.
- Reload preserves applied/discarded/superseded states and history.
- Budget default, explicit custom model choice, and provider resets work in browser.
- No browser console errors observed during the conversation workflow.

## Remaining release gates

GitHub CI must verify real PostgreSQL migrations, CodeQL and container builds.
After merge and deployment, repeat a production conversation smoke test with an
account-authorized provider/model and verify both services run the merged release.
Do not treat local fake-provider testing as confirmation of real model access.
