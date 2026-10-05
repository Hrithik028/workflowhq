# Phase 8: mandatory AI governance

## Requirement

AI governance applies server-side to every project's AI generation after deployment.
There is no environment switch or project opt-out. An obsolete
`AI_GOVERNANCE_ENABLED=false` value does not bypass enforcement.

## Changes

- Shared generation boundary covers direct previews and both conversation modes.
- Migration 029 adds policy and sanitized usage records without replacing deployed
  migrations 026–028. Initial allowlists use the application's existing budget
  models; platform owners can revise these lists and limits.
- Provider/model allowlists, composed-prompt limits, output limits, proposal limits,
  bounded timeouts and atomic per-user daily reservations apply before generation.
- Owner policy edits are audited. Owners may deny a provider but cannot disable
  governance. Missing policy fails closed.
- The management page says Mandatory rather than offering an enforcement switch.
- Personal encrypted credentials, review confirmation, version checks and
  idempotent execution remain in place.
- Tests use explicit mock-model policies, never an enforcement bypass.

## Verification and release

Regression tests exercise enforcement with the obsolete opt-out set to false.
All 233 backend tests and 3 governance UI tests passed, along with lint and types.
Local PostgreSQL checks cover migration execution, multi-action rollback,
concurrent approval idempotency and concurrent quota reservation.
The first quota recheck correctly denied all requests because the same test user
had already generated previews. The fixture now creates a separate quota-test
user; a fresh database run passed all gates without resetting existing usage.
Usage token counts are estimates, not provider billing records.

These changes are local until publishing is approved. Push alone does not activate
them: the backend must deploy the code and apply migration 029. Existing allowed
models should be reviewed before rollout; an unlisted model will be rejected.
The UI overhaul remains pending the user's reference design.
