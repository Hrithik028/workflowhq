# AI planning correction journal

## 2026-10-02 — Production Phase 6 validation failure

Evidence: POST project 4 conversation run returned 502 / AI_PLAN_INVALID at
08:07:32 UTC. The backend logged a post-JSON schema-validation failure, but not
the failing field. No exact field or raw provider response can be recovered from
that log. No ticket was created. This journal tracks this correction; append dated
entries for subsequent related changes rather than replacing the history.

### Change 1 — Constrain provider output

Added string lengths, ID/date/evidence patterns, array limits and the requested
item ceiling to the provider schema. OpenAI and Gemini receive the schema;
Anthropic receives it in its JSON instruction. Backend validation stays authoritative.
Removed silent task slicing: excess work now fails validation instead of potentially
discarding a parent or changing a proposal without the user's review.

### Change 2 — Clarify parent references

The prompt now distinguishes proposal-local temporary IDs from existing ticket keys
and database IDs. Root items require null; parent references must name a higher-level
item included in the same proposal. No automatic reparenting, truncation, costly retry
or model upgrade is introduced.

### Change 3 — Privacy-safe diagnostics and user feedback

Validation errors include only a stage and bounded, allowlisted field paths/codes.
No response values, prompts, Zod messages, unknown property names, or credentials
are logged in those diagnostics. Conversation routes now receive the same error-text
redaction as credential and quick-planning routes. AI_PLAN_INVALID displays a fixed,
actionable message; unexpected server failures retain their generic message.

### Change 4 — Regression verification

Tests cover all three adapter contracts, malformed JSON, field/hierarchy failures,
over-limit output, diagnostic redaction, no automatic retry, and a failed conversation
followed by a valid manual revision. Invalid runs create no proposals, approvals or
tickets. All provider responses in local tests are mocked: no real key or paid call.

Verification results:

- Full backend suite: 32 files / 199 tests passed (95.20 seconds).
- Focused planner, redaction and conversation suite: 26 tests passed.
- Production-mode log-redaction assertion also passed after final review.
- Backend ESLint and changed-file Prettier checks passed.
- Release audit: 266 source files inspected; passed. Git diff whitespace check passed.
- No frontend source changes or database migration. No live provider generation was
  attempted. Provider-specific schema acceptance still needs a deployed live smoke test.

Review loop: inspected contract gaps first, made bounded changes, reviewed privacy
and paid-call behavior, added regression cases, ran focused tests, reviewed captured
production-mode logs, then ran full tests/lint/format/audit. Publication remains pending.

### Release gates still required

User approval to publish; separate correction PR because Phase 6 PR #58 is merged;
GitHub CI; Render deployment; then one user-authorized real-provider smoke test.
This reduces confirmed contract mismatch risks but does not establish the precise
cause of the original response or guarantee a model's future output.

Reference checked: https://developers.openai.com/api/docs/guides/structured-outputs

## 2026-10-02 — Publication preparation

User authorized testing and publishing the correction. Created the separate
`fix/ai-plan-validation` branch from merged master `4b6b57f` so the correction is
reviewable independently of Phase 6. Rechecked the production-code diff, ESLint,
formatting and release audit before publication. The fresh full backend rerun
passed all 32 files / 199 tests in 101.23 seconds before the commit.
No production writes or paid provider calls are part
of this release preparation; merging and deployment remain separate steps.
