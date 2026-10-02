# Phase 7 change journal

## 2026-10-02 — Resume executor integration

The existing executor draft a9ffa2f was based on Phase 4. Integrated deployed master
4b6b57f locally without committing or publishing. Preserved both executor and
conversation documentation in the README conflict resolution.

Renumbered the unpublished executor migration from 026 to 028: deployed migration
026 is the credential vault and 027 is conversations. Existing deployed migrations
remain unchanged.

Updated executor integration fixtures to use the saved encrypted provider vault,
not request-body API keys. Recheck Phase 6 latest-revision approval and consumption
through the shared executor before release.

Conversation diffs and evidence summaries now handle both legacy task proposals and
executor action proposals. Action identifiers are separate from legacy temporary
task identifiers; changed fields and reviewed versions are included in comparison.
Added four regression tests covering initial proposals, changes/removals, switching
formats and referenced evidence. The diff response shape remains backward compatible.

Verification: backend lint passed; all 196 tests across 34 files passed. Focused
executor/conversation/planner tests previously passed (23 tests). Formatting and
Git whitespace checks passed. GitHub workflow status mutations and manual ticket
rank changes increment ticket versions; project archival is separately checked
by the mutation service. Frontend lint, TypeScript checking and production build
passed. All 55 frontend tests across 22 files passed on a serial run.

The first parallel frontend test run had three timing-related failures (one test
timeout and two pending-screen assertions). The unchanged suite passed serially;
this indicates local test contention, not a proven application defect. Parallel
CI stability still needs verification; no assertions or timeouts were weakened.

Test limitation: the test database is pg-mem. Transaction rollback command coverage
does not prove rollback atomicity on real PostgreSQL; verify this before release.

Pending: action generation and human-review UI integration, PR #59 validation
correction integration, real PostgreSQL transaction tests, manual local QA and
release verification. Provider generation and the UI still use legacy task plans;
action-compatible backend helpers do not enable arbitrary actions in the UI.
No production writes, provider charges, commit, push or merge to GitHub performed
for Phase 7 in this session. The local master integration is resolved but uncommitted.

## 2026-10-02 — Action generation and conversation integration

Added opt-in action generation to the existing provider adapters. OpenAI, Anthropic
and Gemini share a bounded proposal schema supporting nine action types. Strict
objects enumerate required fields, nested action variants and requested item limits.
The schema follows official OpenAI structured-output requirements; existing low-cost
model defaults and explicit model selection remain unchanged. No automatic retry or
more expensive model fallback was added.

Conversation runs accept `outputMode: actions`; omitted mode remains creation-only.
The ordinary creation preview is unchanged. The action target catalog is scoped to
the project and includes up to 50 recent tickets (including archived tickets),
reviewed versions and up to 200 criteria. Generated numeric ticket, parent and
criterion references must match this supplied catalog. Invented/stale references,
unknown evidence, malformed output, unsupported deletion and excess actions fail
before an approval is issued. New-ticket null versions are normalized only before
validation. No actions are silently dropped to satisfy the requested limit.

Added the typed action review component and conversation mode selector. Review shows
every field value, null clearing, ticket/version, criterion/order, evidence and
archive/removal warnings, with links to current tickets. Approval requires a checkbox
bound to the proposal ID. Apply uses `proposal:<approvalId>` as a stable retry key,
including after page reload. Discard makes no changes. Creation-only approval and
responses retain their existing contract.

Integration testing exposed pg-mem array-ANY selection incompatibility while applying
ticket evidence. Replaced those bounded evidence queries and the new criteria query
with parameterized IN lists, preserving project filtering and bound values. The
first full regression run also detected extra target metadata in duplicate warnings;
fixed response shaping rather than weakening the existing assertion.

Frontend verification: lint, TypeScript checking, 59 tests across 23 files (serial),
and the production build passed. Backend lint and focused provider/conversation/
executor checks passed; the final full regression rerun passed all 210 tests across
35 files. Git whitespace checks passed and no unresolved merge entries remain.

Remaining release work: browser manual QA, a real provider smoke test, real PostgreSQL
rollback/concurrent retry verification and integration of the separate PR #59 fix.
Assignment and sprint generation require their own membership/sprint context; the
generated action schema intentionally omits those fields for now. No production
records or real provider calls were made, and no commit or push was performed.
See `phase-07-action-review-testing.md` for the release checklist and source references.

## 2026-10-02 — Approved feature-branch publication

The user approved committing and pushing the current Phase 7 changes to GitHub.
Publish on `phase/07-agent-executor` only; do not merge to master. The master
integration is included as a local merge so the branch retains deployed Phase 5/6
history while its review diff contains Phase 7 work. Release audit passed for all
276 source files. PR #59 remains separately open and must be reconciled before
release; this push does not include or deploy that separate validation fix.

The verified baseline remains 210 backend tests, 59 serial frontend tests, lint,
type checking and frontend build. Manual browser/provider and real PostgreSQL
release gates are still outstanding; branch publication does not mark them done.

## 2026-10-02 — Reconcile merged PR #59 with Phase 7

PR #59 was merged into master at commit `3fb76f6`. The user approved resolving
the resulting feature-branch conflict, testing and pushing the same Phase 7 branch,
without merging Phase 7 into master. The conflict was confined to `aiPlanner.js`.

Preserved both proposal modes: action generation retains its action schema and
target/version validation; creation-only generation retains PR #59's per-request
item limits, parent/date guidance and safe validation diagnostics. Exported the
creation-only validator separately so union errors do not hide useful field paths.
Kept item-limit diagnostics and all three provider adapters. Provider response
values and credentials remain excluded from diagnostic output.

Browser QA, real provider generation and real PostgreSQL rollback/concurrent retry
checks remain release gates. This reconciliation does not claim those checks passed.

Verification passed: 222 backend tests across 35 files, 59 serial frontend tests
across 23 files, backend/frontend lint, TypeScript checking and frontend production
build. The final staged release audit inspected 277 source files successfully. No assertions
were weakened and no paid provider requests or production mutations were made.

## 2026-10-02 — Browser preflight for manual QA

Inspected the existing authenticated production AI-conversations tab and Render
dashboard. Render's last successful backend deployment is master `3fb76f6`,
containing Phase 6 and PR #59, not Phase 7 `45d09f7`. After refreshing the app,
conversation history loaded, but no Phase 7 proposal-mode selector was present.
The retained earlier run showed `AI_PLAN_INVALID`; no new generation was attempted.

The user-created PR #60 was visible with no base-branch conflicts and checks in
progress. No merge, deployment, paid provider call, or production record mutation
was performed. Phase 7 manual execution remains blocked in that production tab
until a Phase 7 preview is available or an explicitly approved release is deployed.
This is a preflight observation, not a passing end-to-end manual test.

## 2026-10-02 — Readable proposal review (local only)

Replaced raw action labels with readable ticket/criteria cards, friendly field and
status names, and expandable technical references. Consecutive criterion additions
for a new ticket appear under its ticket card; nonconsecutive actions keep their
original order. New-ticket null defaults move to technical details as "Not set";
explicit clearing of existing-ticket fields remains visible as "Clear value".
The original signed proposal is not mutated by rendering or grouping.

Creation-only proposals now expose descriptions and individual criteria. Revision
diffs are expandable, and approval has a dedicated confirmation row, explanatory
text and grouped buttons. Confirmation, permission checks and retry keys remain
unchanged. No direct editing of signed proposals or approval bypass was introduced.

Verification: 61 frontend tests passed across 23 files, TypeScript, lint and Vite
production build passed. Inspected the local sample preview in the browser and
expanded its technical section; grouped criteria and unset metadata displayed
correctly. The preview makes no API calls. No live tickets were changed, and these
layout changes have not been committed, pushed or deployed.

## 2026-10-02 — Approved proposal-layout publication

The user approved pushing the reviewed layout changes. Created a separate branch
`fix/ai-proposal-review` from current master `e34341e`, preserving the local changes.
Final focused review/workspace checks passed (7 tests), formatting passed and the
release audit inspected 279 source files successfully. The prior full frontend
baseline was 61 passing tests, with lint, TypeScript and production build passing.
Publication does not authorize merging or mark production execution QA complete.
