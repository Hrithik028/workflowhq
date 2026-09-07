# WorkflowHQ GitHub App implementation plan

This plan turns the existing GitHub database foundation into a truthful, project-scoped integration. It is intentionally split into deployable phases so each release can be disabled without losing data.

## Current implementation status

| Phase | Capability | Status |
| --- | --- | --- |
| 1 | Secure connection foundation | Complete |
| 2 | Repository discovery and project assignment | Complete |
| 3 | Bounded historical development sync | Complete |
| 4 | Signed, deduplicated webhooks | Complete |
| 5 | Exact-key ticket linking and product UI | Complete |
| 6 | Durable acceptance criteria and archive lifecycle | Complete |
| 7 | Secure project invitations | Complete |
| 8 | Project workflow automation | Complete |
| 9 | Contributor identity and webhook recovery | Complete locally |
| 10 | Developer-beta release audit | Complete locally; approval and deployment verification pending |

## Authority model

- `platform_owner` controls the WorkflowHQ platform and the central GitHub App configuration.
- `admin` manages workspace policy but does not automatically become a member of every project.
- A user who creates a project remains a workspace `user` and becomes that project's `owner`.
- Project `owner` members connect repositories and manage matching rules.
- Project `editor` members can work with tickets and manually link development activity.
- Project `viewer` members have read-only access.
- GitHub installation tokens and private keys never reach the browser or PostgreSQL.

## Phase 1 - secure connection foundation

1. Add one-time, SHA-256-hashed connection state with expiry and atomic consumption.
2. Add installation and repository lifecycle/sync status without changing deployed migration 006.
3. Add feature-flagged server-only GitHub App configuration.
4. Add a fixed-origin GitHub client that creates short-lived App JWTs and installation tokens.
5. Add connect and callback endpoints that verify the installation before saving it.

## Phase 2 - repository discovery and project assignment

1. Import every repository granted to the installation using bounded pagination.
2. Let project owners with `github.manage` assign an available repository to a project.
3. Let every member of that project read its repository and ticket development history.
4. Preserve imported history when access is suspended or removed.

## Phase 3 - historical development sync

1. Import a bounded history of commits, pull requests, workflow/check results, deployments, and releases.
2. Upsert by stable GitHub identifiers so repeated syncs are idempotent.
3. Persist sync runs, counts, checkpoints, rate-limit state, and sanitized failures.
4. Derive production activity only from real deployment/environment data.

## Phase 4 - signed webhooks

1. Verify `X-Hub-Signature-256` against the exact raw body with constant-time comparison.
2. Deduplicate `X-GitHub-Delivery` before applying effects.
3. Normalize only the supported event fields; never retain raw payloads.
4. Process installation, repository, push, pull request, check, deployment, and release lifecycle events.

## Phase 5 - ticket linking and product UI

1. Match exact project issue keys in branch names, commit messages, and pull request text.
2. Restrict automatic matches to projects assigned to that repository.
3. Support many tickets per GitHub event and record whether a link is automatic or manual.
4. Add Settings connection/repository management, project development history, real task details, sync health, and truthful command-center metrics.

## Phase 6 - durable ticket definition and lifecycle safety

1. Store acceptance criteria as ordered ticket records instead of description text.
2. Let authorized members add, edit, complete, reorder, and remove criteria.
3. Archive projects and tickets reversibly while preserving hierarchy and development history.
4. Require child tickets to be archived before their parent and block unsafe permanent deletion.

## Phase 7 - secure project invitations

1. Create expiring, revocable invitations with only a SHA-256 token hash stored in PostgreSQL.
2. Require the signed-in account to match the invited email exactly before membership is granted.
3. Support owner-managed editor and viewer invitations with a copy-link fallback.
4. Keep email optional and server-side through a configured provider and verified sender.

## Phase 8 - project workflow automation

1. Give each project safe defaults for commit, pull-request, check, and deployment signals.
2. Apply automation only to future signature-verified webhooks from an assigned repository.
3. Require an exact ticket key and move status forward only.
4. Keep every automation run idempotent and auditable, with rules editable only by project owners.

## Phase 9 - contributor identity and webhook recovery

1. List GitHub actors observed in verified activity for repositories owned by the installation.
2. Map an actor only to an existing member of a project linked to that installation.
3. Enrich existing and future development history dynamically without rewriting imported evidence.
4. List sanitized failed-delivery receipts and request GitHub redelivery with the App credential.
5. Enforce owner scope, a three-day recovery window, a one-minute cooldown, and five requests per delivery.

## Phase 10 - developer-beta release audit

1. Run full lint, type, unit, integration, migration, dependency, and production-build checks.
2. Verify that no credential, private key, raw webhook body, or local environment file is published.
3. Refresh screenshots and operator documentation for the shipped workflows.
4. Execute the generic pre-deploy and post-deploy checklist without storing provider-specific secrets.
5. Show the final local preview and publish only after explicit approval.

## Release gate

Before any push or production enablement:

1. Run all backend and frontend lint, type, unit, integration, migration, security, dependency-audit, and production-build checks.
2. Exercise connection, callback replay, repository assignment, historical sync, webhook replay, ticket matching, suspension, and disconnect paths.
3. Inspect desktop, tablet, and mobile layouts in the local browser.
4. Show the local preview and provide the exact commits, environment variables, GitHub App permissions/events, migrations, and deployment sequence.
5. Push only after explicit user approval.
