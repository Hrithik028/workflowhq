# Phase 7 action generation and review testing

## Local automated coverage

Backend provider tests mock network responses; they do not charge a real key.
They check OpenAI, Anthropic and Gemini payloads, schema shape, target/version and
criterion validation, evidence boundaries, item limits and malformed output.
Conversation integration tests check that proposing changes does not change a
ticket, that approval marks the revision applied, and that archived ticket and
criterion context can support restore. Existing executor tests cover permissions,
stale versions, idempotent retries, hierarchy and the rollback command path.

Frontend tests check explicit action mode, exact action display, escaped text,
destructive-action warnings, confirmation gating and stable retry keys. The old
creation-only review remains covered. Run frontend tests serially for local QA;
the prior parallel run had timing failures on this machine.

## Manual preview checklist (not yet executed for this iteration)

1. Use a disposable local project with migration 028 applied. Add a ticket with
   two criteria. Store a provider credential in personal AI settings.
2. Open the project's AI conversations. Keep the chosen low-cost model or select
   an explicitly preferred supported model. Create a conversation.
3. Confirm the proposal-mode default is **Create new tickets only**. Switch to
   **Propose ticket and criteria changes**. Request a status change for the ticket
   using its issue key, and one new acceptance criterion.
4. Generate a revision. Confirm the original ticket and criteria are unchanged.
   Inspect action targets, versions and values and open the current-ticket link.
5. Confirm approval is disabled until the review checkbox is checked. Approve and
   verify status/criteria, revision state and activity. Retry a lost response and
   verify there is one execution, not duplicate criteria.
6. Generate a second proposal, then manually edit that ticket before approving.
   Expect a version conflict and no approved changes. Generate a fresh revision.
7. Generate two revisions and confirm only the latest can be approved. Discard a
   proposal and confirm no ticket changes. Repeat as a viewer: no generation or
   execution should be available.
8. Explicitly request archive of a leaf ticket, approve, then request restore and
   approve. Active child and archived-parent restrictions must remain enforced.

Real provider generation requires an explicit user action and can incur charges.
Provider request fixtures passing are not proof of a successful real provider call.

## Release gates

- Integrate the separately reviewed PR #59 validation/diagnostic fix.
- Verify multi-action rollback and concurrent retry behavior on real PostgreSQL,
  not only pg-mem (which does not restore table state on ROLLBACK).
- Complete browser QA and a paid-provider smoke test with user authorization.
- Review the Phase 7 diff against current master, then publish only after approval.

Schema references used in this implementation:
[OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
and [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output).
