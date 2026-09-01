# WorkflowHQ GitHub App implementation plan

This plan turns the existing GitHub database foundation into a truthful, project-scoped integration. It is intentionally split into deployable phases so each release can be disabled without losing data.

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

## Release gate

Before any push or production enablement:

1. Run all backend and frontend lint, type, unit, integration, migration, security, dependency-audit, and production-build checks.
2. Exercise connection, callback replay, repository assignment, historical sync, webhook replay, ticket matching, suspension, and disconnect paths.
3. Inspect desktop, tablet, and mobile layouts in the local browser.
4. Show the local preview and provide the exact commits, environment variables, GitHub App permissions/events, migrations, and deployment sequence.
5. Push only after explicit user approval.
