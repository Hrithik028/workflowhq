# Local workspace release: implementation and QA journal

Date: 6 October 2026. Checkout: `phase-07-agent-executor` worktree;
branch: `feat/workspace-isolation-foundation`. No push, merge or production writes were made
for this implementation. Jira live synchronization is excluded by request.

## Implemented locally

| Area                  | Delivered behavior                                                                                                                                                                                                                                                                                         |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Notifications         | Durable assignment, comment and membership notices; project permission and active-workspace filtering; individual/all-read actions; invitation-acceptance notice. In-app only.                                                                                                                             |
| Custom workflows      | Owners add up to twelve ordered stages, rename them and configure stage-to-stage moves. Each stage has a stable reporting category. Board, editor, detail, hierarchy and roadmap display the stage; GitHub automation continues to target the three canonical stages.                                      |
| Roadmaps/dependencies | Project roadmap with date context and blocking relationships; same-project authorization; duplicate/self/cyclic relationships rejected.                                                                                                                                                                    |
| Workspaces            | Personal/team workspaces, creation, membership-scoped listing, active selection bound to refresh sessions, existing-account member management, rules, AI restrictions, audit and password-confirmed ownership transfer.                                                                                    |
| Isolation             | Active workspace scopes requests. Mandatory database roots and composite project/repository/installation foreign keys reject missing roots and cross-workspace links. GitHub workers derive scope from stored installations; webhook ticket linking checks both task and project roots. No RLS is claimed. |
| AI policy             | Mandatory platform policy plus workspace restrictions. Provider intersection and minimum limits prevent workspace administrators from relaxing platform ceilings. Account-wide usage avoids switching workspaces to evade quotas.                                                                          |
| Credentials           | Personal backfill for existing keys; new encryption v2 authenticates workspace identity. Keys remain user-owned, not shared with workspace members.                                                                                                                                                        |
| Loading/navigation    | Small transparent loading indicator for slow requests/session restoration; light/dark styling; existing logged-in landing-page link preserved.                                                                                                                                                             |

## Browser-discovered corrections

1. **Session refresh race:** React StrictMode restoration and API retry could issue concurrent
   refresh requests, invalidating a just-rotated refresh token and losing workspace selection.
   Both now share one pending refresh promise. Failure clears it so a future retry is possible.
2. **Invitation row lock:** unqualified `FOR UPDATE` on a query with a nullable inviter join
   failed on real PostgreSQL. Acceptance now locks the concrete invitation/project rows before
   reading display joins. Queries on a transaction client run sequentially.
3. **Invitation navigation:** accepting an invitation from a personal workspace now returns its
   destination workspace, switches the session and opens that project's board. Replaying an
   accepted link cannot restore subsequently revoked project access.
4. **Policy persistence:** updating ordinary rules preserves saved AI policy and vice versa;
   both serialize through a workspace-row lock and record an audit event.
5. **Test resource contention:** frontend tests use two workers on this workstation rather than
   launching excessive parallel browser-like environments. Test assertions/timeouts were not
   weakened to conceal a failure.
6. **Date-only serialization:** the CSV browser test exposed an October 10 deadline displayed as
   October 9. PostgreSQL DATE values now remain calendar-date strings instead of local-midnight
   JavaScript Date objects. Real timestamps retain their timestamp parser. The corrected date
   was verified by reloading the roadmap against real PostgreSQL.

## Verification results

- Backend: **269 tests / 44 files passed**, including stale tokens, revoked memberships,
  cross-workspace read/write rejection, scoped inbox/notifications/rules, ciphertext tampering,
  ownership reauthentication, AI policy intersection, invitation replay protection and date-only
  serialization without timezone drift.
- Frontend: **101 tests / 35 files passed**; final expanded regression is recorded in
  [the follow-up journal](workspace-hardening-custom-stages.md). Both lint suites, TypeScript checking and Vite build
  passed. The main bundle is above Vite's 500 KB advisory threshold; this is not a build failure.
- Real PostgreSQL: all checked-in migrations applied to an empty disposable local database;
  transaction rollback, concurrent approval/idempotency and quota reservations passed.
- Browser MCP: created a disposable team/project and two tickets; saved a real acceptance
  criterion; moved a ticket; renamed statuses; disabled direct planned-to-delivered movement;
  saved a blocking edge and observed reverse-edge cycle rejection; accepted an invitation as
  another account; verified notification/read controls; selected a personal workspace with an
  empty ticket list and rejected a known team ticket URL; saved/reloaded AI limits and preserved
  them through a rules save; archived/restored the project with both tickets still attached;
  transferred team ownership and observed the former owner become an administrator.
  The existing one-time CSV importer created BQA-3 from a synthetic QA-101 export; a repeated
  preview recognized the existing mapping and disabled duplicate import. The loading preview
  was visually checked in both light and dark themes with the background ribbon visible.

The browser API used real local PostgreSQL, not the in-memory demo. The QA server refuses remote
databases or database names outside `workflowhq_qa_*`; its resume mode requires its own fixture
accounts. Email/GitHub/paid LLM calls were disabled. No real users, production permissions,
production tasks, Render settings or external repositories were changed. A browser without
WebGL2 cannot render the animated ribbon; basic pages and loading text remain usable.

## Remaining release gates, not new Jira work

1. Review the local diff and publish approved phases separately. Do not merge automatically.
2. Verify production `schema_migrations` names before rollout: notifications are migration
   **034**, not a second conflicting 031. Do not rewrite an already-applied SQL file.
3. Take a database backup and test migration against a populated staging copy. Migration 035
   deliberately stops if one installation already spans multiple workspace roots; resolve that
   mapping explicitly rather than bypassing its guard.
4. Deploy backend/frontend compatible versions, apply migrations, then enable
   `WORKSPACES_ENABLED=true` on the backend. Keep it false if rollout review is incomplete.
5. Verify migrated accounts/projects/keys, session refresh, invitations and two-workspace
   isolation in staging and production using controlled records. Re-run the real GitHub
   installation/webhook and approved-provider AI flow after deployment; this local run did
   not claim those external integrations were exercised end to end.
6. Migration **036** reconciles legacy roots and requires non-null ownership. It aborts on
   unresolved or conflicting project/repository mappings. Migration **037 (next additional-stage phase)** adds stage identity
   and category consistency constraints. Update out-of-band writers before rollout; direct SQL
   must supply valid roots and stages. There is no RLS or exhaustive proof of every export/job:
   these database consistency checks complement, not replace, application authorization.
7. Preserve additive migrations on rollback. Turning off the workspace gate returns legacy
   project-member behavior and is **not** an acceptable emergency mode for a public
   multi-tenant deployment; restrict access or roll back the deployment instead.

Jira synchronization, optional email notifications and a new visual
overhaul are separate follow-ups. The reference design for the overhaul has not been supplied.
