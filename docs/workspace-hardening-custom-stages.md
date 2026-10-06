# Workspace hardening and additional stages — local follow-up

6 October 2026. Requested scope: the first two follow-ups only. Implementation and its
initial QA were local; the user subsequently approved pushes after a full visual review.
No merge, deployment, production records or real provider calls were made for this follow-up.
The pre-existing pending notifications/workspace/loading changes were preserved.

## 1. Workspace-root hardening

- Additive migration **036** reconciles legacy roots before requiring workspace ownership
  on projects, tasks, activity, GitHub installations/repositories/connection state,
  notifications, saved AI credentials and refresh sessions.
- Composite foreign keys reject task/project, notification/project,
  repository/installation/owner and project/repository-link mismatches.
- Unresolved null roots or conflicting mappings abort migration; no arbitrary tenant is
  selected to make a migration pass. Deleted-entity legacy activity falls back to its actor's
  personal workspace only when its original project/task is no longer present.
- Refresh sessions insert their root atomically instead of inserting null then updating.
- GitHub repository refresh and webhook upserts derive roots from stored installations,
  do not reassign an existing repository across installations/tenants, and verify both task
  and project workspace roots before automatic event linking.
- Existing request-level scope and project-membership checks continue to authorize reads
  and writes, including inherited conversations, imports, sync runs and event records.
  Database consistency constraints are not row-level security and are not a proof over all
  possible future workers or direct-SQL exports.

## 2. Additional custom stages

- Additive migration **037** separates workflow_stage from canonical tasks.status.
  Up to **12** stages map to todo, in_progress or completed.
- Keep the three canonical stages as protected anchors. Owners can add stages, name and
  reorder them, and select allowed directed moves. Saved categories are immutable.
- Stage/category composite foreign keys reject inconsistent data. Manual moves are checked
  against actual stage keys, including Review → QA when both are in_progress.
- Metadata edits preserve a custom stage. Moving projects resolves the destination stage.
  Inbox tickets keep canonical statuses. Occupied stages cannot be removed, including when
  every ticket in the stage is archived.
- Project locking serializes stage changes with ticket mutation. Configuration response data
  is read inside the transaction before commit.
- Board columns, lane focus, optimistic movement, keyboard selectors, ticket editor/detail,
  hierarchy and roadmap use the stage identity. All-project boards aggregate by canonical
  categories because different projects can have different stages.
- GitHub rules still select canonical categories/destination anchors; this follow-up does
  not add arbitrary-stage GitHub triggers or change the provider AI action contract.
- Browser testing found the desktop empty-lane creation button was hidden by an existing
  mobile-only CSS rule. New issue now appears in the board header and defaults to the
  focused stage. Project switching clears a stale lane filter.

## Evidence

- Full backend regression: **269 tests, 44 files passed**.
- Full frontend regression: **101 tests, 35 files passed**. Follow-up board regression also
  passed after making the creation action desktop-visible.
- Backend/frontend ESLint, TypeScript and Vite production build passed. The existing main
  bundle remains over Vite's 500 KB advisory threshold.
- Source release audit passed; no runtime database, key, token or screenshot was added to
  tracked source.
- Real PostgreSQL 16: all migrations on an empty disposable local database; rollback,
  concurrent approval/idempotency and quota checks passed. Migrations 036/037 also upgraded
  the populated browser QA database successfully.
- The verifyWorkspaceStages.cjs script passed real PostgreSQL rejection checks for
  missing roots, cross-workspace task/repository links and stage/category mismatches;
  webhook root derivation ignored a forged caller root. Review → QA succeeded and an
  unconfigured reverse move was rejected. This script requires a local workflowhq_qa_ database
  and creates synthetic records; it never deletes data or loads environment files.
- Browser MCP (real local PostgreSQL): saved and reordered Review/QA stages; moved BQA-1
  Building → Review → QA; reload preserved QA; editing its description preserved QA;
  created BQA-4 directly in the focused Review lane; removal of occupied QA was rejected
  with a useful message. No production or GitHub/Render settings were touched.

## Approved publishing order — separate phases, no merge

1. Publish the earlier custom-workflow and roadmap prerequisites as separate branches.
2. Workspace isolation release plus root hardening, including prerequisite migrations
   033–036 and compatible session/notification/credential writers.
3. Additional custom stages, migration 037 and compatible board/editor/automation changes,
   based on the workspace release.

Review and publish these as separate feature commits/PRs, not an automatic merge. The current
worktree also contains earlier unpublished phases; do not push only migration 036 without
its compatible writers or migration 037 without its API/UI changes.

The browser visual review and corrections are recorded in ui-manual-qa-oct06.md.

Before production: back up the database, verify applied migration names, rehearse on a
populated staging copy, update any out-of-band SQL writers, deploy compatible applications,
then enable workspaces. Do controlled production isolation and real GitHub/provider smoke
checks. Jira synchronization, notification email delivery and the reference-design UI overhaul
remain outside this follow-up.
