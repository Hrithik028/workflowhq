# Workspace isolation and Jira sync boundaries

Status on 6 October 2026: workspace management and request isolation are implemented and
tested locally behind `WORKSPACES_ENABLED=true`. They have not been pushed or deployed as
part of this work. Jira synchronization is explicitly deferred at the user's request.
The one-time Jira CSV importer remains available; it does not connect to a live Jira site.

Migrations 033–037 add personal workspaces, notifications, selected-workspace sessions,
workspace data roots, policy and audit records. The UI supports creation, switching,
existing-account membership management, stricter rules/AI limits and team ownership transfer.
See [the validation journal](workspace-release-qa.md) for actual tests and rollout gates.

Project membership remains a second permission check: joining a workspace does not expose
every project. Global platform ownership is separate from workspace and project ownership.
When isolation is enabled, platform administration is restricted to the platform owner;
workspace owners/admins use **Manage workspaces** for their local administration.

## Phase 7: multiple workspaces

1. Add `workspaces` and `workspace_members` with one owner per workspace. Backfill each existing
   project into its creator's personal workspace and add all current project members to that
   workspace. Preserve current project roles; workspace membership does not silently promote a
   project editor to workspace administrator.
2. Scope roots explicitly: projects, tasks/inbox, activity, notifications, GitHub installations,
   repositories and connection state, saved AI credentials, workspace rules and audit records.
   Child records such as invitations, Jira mappings, conversations, approvals, sync runs and
   development events inherit scope through their checked project or installation/repository.
   Migration 036 requires roots and enforces composite task/project, notification/project,
   repository/installation and project/repository-link ownership. Direct-SQL writers must
   provide valid roots. These consistency constraints complement application authorization;
   they do not establish PostgreSQL RLS.
   User authentication, platform ownership and anti-abuse AI usage counters remain global.
3. Bind an active workspace to the authenticated session. Switching workspaces must verify current
   membership on the server, rotate the access token, and persist the selection in the refresh
   session. Never trust a client-supplied workspace ID on its own. Membership revocation must
   invalidate or reject the old workspace context immediately.
4. Scope every list, detail, mutation, search, aggregate, and background job to the active
   workspace. Project membership remains an additional gate for project data. An unknown or
   inaccessible record returns the same not-found response to avoid cross-workspace enumeration.
5. Separate workspace administration from platform ownership. A workspace owner manages members,
   rules, and integrations only for that workspace. The platform owner retains the global recovery
   and transfer authority; no workspace admin can grant themselves platform ownership.
6. Bind GitHub App installations and selected repositories to one workspace at a time. A
   cross-workspace installation attach is rejected; there is no move/share-installation UI yet.
   Migration aborts if existing links straddle workspaces, instead of choosing an arbitrary root.
   Integration management remains installer-owned and requires workspace manager access.
   Webhook processing resolves project/repository scope from stored links.
7. Keep AI governance mandatory. Apply global server ceilings and a workspace-level policy;
   do not automatically expose a user's saved provider credentials to other workspaces. Migration
   of existing credentials into the personal workspace is recorded by the additive SQL migration.
   Existing v1 ciphertext remains readable; new saves use v2 authenticated encryption bound to
   the user, provider, key version and workspace. Workspace policy intersects allowed providers
   and takes the minimum of global and workspace limits. It cannot disable governance or enable
   a globally disabled provider. Daily run counts remain per account across workspaces.
8. Add workspace creation, switching, member management, and workspace-specific settings only
   after the server isolation tests pass. The default view should continue to show the migrated
   personal workspace with no loss of existing projects or tickets.

### Release tests for phase 7

- A user with access to two workspaces sees only the selected workspace's projects, tasks,
  analytics, search, notifications, AI conversations, Jira mappings, and GitHub history.
- A forged workspace ID, stale access token, revoked member, and cross-workspace object ID cannot
  read or mutate data through any route, worker, webhook, or export.
- Existing users and projects survive migration with the same project roles and issue keys.
- A platform owner can transfer or recover workspace ownership without giving an ordinary
  workspace owner global administrative powers.

## Phase 8: ongoing Jira synchronization

**Deferred. Do not implement or deploy this phase until explicitly requested.** The following
is a future design checklist, not a statement that synchronization exists.

This phase follows workspace isolation. The existing Jira feature is a one-time CSV preview and
import, with stable issue mappings; it is not an authenticated live Jira connection.

1. Add a workspace-scoped Jira connection with server-side encrypted credentials, explicit
   project mapping, connection health, revocation, and a safe disconnect path. Choose and verify
   the exact Jira Cloud authorization mechanism before implementing the adapter.
2. Start in read-only, import-to-WorkflowHQ mode. Track a durable incremental checkpoint and
   source revision for every mapped issue. Replaying a page or webhook must be idempotent.
3. Compare source revision, local task version, and last synchronized snapshot before applying
   changes. When both sides changed, create a visible conflict record and require a human choice;
   never silently overwrite ticket descriptions, acceptance criteria, or status.
4. Add outbound changes only behind a separate owner approval and per-project field policy.
   Retries need idempotency keys, bounded backoff, and an audit summary without raw credentials
   or sensitive provider payloads.
5. Treat deletion and archival as explicit policy decisions. Disconnect stops jobs and webhooks
   but preserves imported tickets, mappings, and audit history until the owner chooses a separate
   cleanup action.

### Release tests for phase 8

- A Jira connection cannot read or write another workspace's project or mapping.
- Repeated webhooks, retries, partial pagination, rate limits, and credential expiry do not
  duplicate tickets or lose the checkpoint.
- Conflicting local/Jira edits remain visible without either side being overwritten.
- Disconnect and revoked authorization stop outbound writes, leave WorkflowHQ tasks intact, and
  report a clear integration state.

No schema or UI for phases 7 or 8 should be shipped until the respective boundary tests above
can be demonstrated locally and the production migration/rollback plan is reviewed.
