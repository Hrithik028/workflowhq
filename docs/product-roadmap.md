# WorkflowHQ product roadmap

This roadmap extends the shipped developer-beta without weakening the current project, ticket,
GitHub, authorization, and audit boundaries. Every phase is independently reviewable and must pass
the release gate before the next phase is merged.

## Delivery order

| Phase | Milestone | Exit condition |
| --- | --- | --- |
| 1 | Release baseline | Current master is verified, stale documentation is corrected, and remaining production smoke checks are explicit. |
| 2 | AI task planner | A user can choose an approved LLM provider, preview a structured hierarchy generated from a project goal, and approve selected records before anything is written. |
| 3 | Jira one-time import | An authorized project owner can preview and import a bounded Jira project with stable source identifiers and an auditable result. |
| 4 | Notifications | Users receive durable, permission-scoped in-app notifications with optional server-side email delivery. |
| 5 | Custom workflows | Project owners can configure statuses and valid transitions without breaking GitHub automation or archived history. |
| 6 | Roadmaps and dependencies | Tickets can express blocking relationships and appear on a project roadmap with cycle-safe dependency validation. |
| 7 | Multiple workspaces | Data, roles, integrations, and administration are isolated by workspace, with explicit workspace switching. |
| 8 | Jira synchronization | Approved Jira connections can reconcile incremental changes with conflict records, checkpoints, and a safe disconnect path. |

## Shared implementation rules

1. Preview destructive or bulk writes before execution.
2. Keep provider credentials server-side and encrypt persisted user-provided secrets.
3. Scope every query and permission decision to the current project or workspace.
4. Store stable external identifiers so retries remain idempotent.
5. Record auditable summaries without retaining raw provider payloads or secrets.
6. Add migrations rather than editing an applied migration.
7. Add backend authorization tests, frontend interaction tests, and a production smoke plan.
8. Keep each phase behind a disabled-by-default capability flag until its release gate passes.

## LLM provider boundary

The AI planner must not depend on one vendor's SDK, response envelope, model names, or credential
format. The application owns a small internal adapter contract that accepts the planning request
and returns the same validated task-plan schema for every provider.

Initial adapters may cover OpenAI, Anthropic, Google, and administrator-approved
OpenAI-compatible services. Additional hosted or self-hosted operators can be registered without
changing project or ticket code. Arbitrary user-entered endpoint URLs are not allowed because a
backend proxy to an unrestricted URL would create a server-side request-forgery boundary.

Provider rules:

1. The browser selects a registered provider and model capability; it does not send a raw URL.
2. User-provided credentials are request-scoped by default and are never logged, returned, or
   written to PostgreSQL.
3. Persisted credentials, if introduced later, require explicit opt-in and authenticated
   encryption with a separately managed server key.
4. Every adapter disables provider-side response storage when the provider supports that option.
5. Provider output is treated as untrusted and validated against WorkflowHQ's strict plan schema.
6. A provider can generate only a preview. Existing WorkflowHQ authorization and task APIs perform
   the approved write.
7. Provider errors are normalized to safe WorkflowHQ error codes without exposing credentials or
   raw upstream responses.
8. Rate limits, timeouts, item limits, and audit summaries apply consistently across providers.

## Current status

Phase 1 is in progress. The automated baseline is green on master commit `2e67241`: CI and CodeQL
passed, the public backend and frontend are healthy, the source audit inspected 229 files, and the
local suites passed 147 backend and 48 frontend tests. Authenticated production smoke checks remain
manual because they require the platform-owner session and controlled test records.
