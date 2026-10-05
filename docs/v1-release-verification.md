# WorkflowHQ v1 release verification

Started 2026-10-05 (Australia/Sydney). This is a release checklist, not a declaration
that every gate has passed. Keep new changes local until separately approved.

## Verified baseline

- GitHub master: `c80e0e819c99af91667b5c315cdb0468e785e55c` (PR #61).
- [Master CI](https://github.com/Hrithik028/workflowhq/actions/runs/36992750778): successful.
- [Master CodeQL](https://github.com/Hrithik028/workflowhq/actions/runs/36992750751): successful.
- Public backend `/api/health`: status ok, database connected.
- Render backend live commit: `e34341e` (Phase 7). PR #61 changes only frontend
  files and documentation; this backend commit difference is not itself a defect.
- Source release audit: 279 source files passed before this checklist was added.
- Fresh local full regression: 222 backend tests (35 files), 61 frontend tests
  (23 files, serial), backend/frontend lint and TypeScript passed.
- Frontend production build: passed.
- Render frontend live commit: `c80e0e8`; PR #61 deployed successfully.

## Production browser QA

Signed-in production testing used project 6, Production release smoke test,
and disposable ticket QA2609-77. No existing tickets or access were changed.

- [x] Verify frontend release contains PR #61's readable review layout.
- [x] Creation-only: generate a Task with two criteria; preview makes no changes;
      approve and verify exactly one ticket and two persisted criteria.
- [x] Actions: change that test ticket's description and add one criterion;
      inspect the target, confirm, apply and verify persisted values after reload.
- [x] Discard a proposal; no task mutation.
- [ ] Expired/superseded approval cannot apply.
- [x] Change a target after generation; stale proposal cannot mutate it.
- [ ] Repeat an apply request using the same key; no duplicate task or criterion.
- [ ] Viewer cannot generate or approve a mutation.
- [x] Archive/restore the disposable ticket without altering existing work.

Provider generation can incur charges. Use the user's selected low-cost model;
do not silently change provider/model or retry failed generation automatically.

Both generations used the pinned gpt-5.6-luna model. Revision 1 created exactly
one ticket with two separately persisted criteria. Revision 2 applied exactly two
actions: description update and addition of one criterion. Reload confirmed the
new description and three criteria; title, status, priority and assignee stayed
unchanged. Both revisions show Applied.

Action generation initially showed a frontend error after approximately 12 seconds,
but later reload revealed a completed server run and pending revision. No paid
retry was made. The frontend's global 12-second timeout was shorter than the
server's supported 60-second provider deadline. Local remediation scopes a
90-second request timeout to conversation generation and direct preview only;
ordinary requests and approval calls retain their existing deadlines.
This remediation is not yet published or verified in production.
Local verification after remediation: all 64 frontend tests across 24 files,
TypeScript, ESLint and Vite production build passed. Three new API tests cover
both generation deadlines and absence of automatic retry. Git diff whitespace
validation passed. Backend code was not changed.

## Additional browser tests, 2026-10-05

- Archived QA2609-77 using the recoverable confirmation dialog. It disappeared
  from active tasks and appeared in Archive under its original project.
- Restored only that ticket. Reload confirmed its project, description and all
  three criteria were preserved. No unrelated archived project was restored.
- Generated revision 3 with the same pinned budget model: one description-only
  action for QA2609-77. Approval was disabled until the review checkbox was set.
- Manually changed the ticket description after generation and verified that
  change after reload. Applying revision 3 was rejected with: "This ticket changed
  after the plan was reviewed. Generate a new preview."
- Discarded revision 3. It became Discarded, approval controls disappeared, and
  the ticket retained the newer manual description and three criteria after reload.
- Applied revisions also have no approval controls; this is a UI replay barrier,
  not proof of concurrent same-key server idempotency.
- Marked the third criterion complete through the manual UI. Reload preserved
  completion (the control now says Mark incomplete). Left this verified test
  criterion completed; the two original criteria remain incomplete.

UI findings to fix separately: applied action cards still say "Nothing applied
yet" despite an Applied badge, and an old generation-success notice remains
alongside the stale-plan error. Neither caused a mutation in this test.

Not manually proven: viewer-account denial (no separate authorized viewer session),
expiry/supersession rejection, concurrent idempotency or real PostgreSQL rollback.
The unpublished timeout fix cannot be verified against the production browser yet.

## Real PostgreSQL gate

An isolated PostgreSQL 16 cluster on loopback port 6544 was created for disposable
QA only. Existing local databases and remote production databases were not used.
The verification script refuses remote hosts and nonempty databases.

- [x] Configure an explicitly disposable local test database, without committing
      its credentials.
- [x] Apply current migrations to that database.
- [x] Test multi-action rollback with actual persisted-state assertions.
- [x] Test concurrent same-key retry; exactly one execution commits.
- [x] Concurrent daily quota reservation: one allowed, four denied.

pg-mem tests do not establish real transaction rollback or concurrent behavior.

## Phase 8 integration findings and order

Existing Phase 8 commit: `86ddabb`, based on Phase 4 rather than current master.
A read-only merge simulation reports conflicts in README, backend environment
example, environment configuration, planner controller, planner library and test
app helper. No integration merge or cherry-pick was started during this audit.

1. Integrate on a separate local branch based on current master, preserving Phases
   5–7 and the proposal review fixes.
2. Add governance migration using the next available number (currently 029).
   Never overwrite deployed 026 (vault), 027 (conversations) or 028 (executor).
3. Apply provider/model allowlists, prompt/action limits and quota reservation to
   both direct preview and conversation generation, including both proposal modes.
   The older draft only hooks the direct-preview controller.
4. Preserve safe diagnostic handling, encrypted personal credentials, strict
   schemas, review confirmation, approval scope, versions and idempotent execution.
5. Verify mandatory enforcement without an opt-out, server ceilings, platform-owner-only
   policy editing, concurrent quota enforcement, failed-run accounting and audit
   privacy. Usage estimates must not be presented as exact billing/token usage.
6. Run full backend/frontend tests, lint, types, production build, source audit,
   real PostgreSQL migrations/transactions and browser tests before requesting push.

Local implementation now adapts the draft through additive changes, not a merge
of its old Phase 4 base. Mandatory enforcement covers both generation entry points.
Backend regression: 233 tests passed. Governance UI: 3 tests passed. Backend and
frontend lint and frontend type checks passed. Browser preview shows Mandatory
and the saved local daily limit of 2. Production deployment remains unverified.

## Closeout

- [ ] Review open security alerts by severity and affected runtime path.
- [ ] Record production evidence and remaining limitations.
- [ ] Update implementation tickets to reflect verified states, not merely pushes.
- [ ] Document release configuration and rollback instructions.
- [ ] Obtain publishing/merge approval; verify the deployed release afterward.

No new feature scope is required to complete the agreed v1 release.
