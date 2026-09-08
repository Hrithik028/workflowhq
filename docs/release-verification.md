# Developer-beta release verification

## Evidence and remaining gates

- PR #14 was merged. The feature commit is `a0425ff`; merged-branch CI passed
  for `95191a98e7f9c065c323e9f9a3418dbf14a975e0`.
- GitHub was checked again on September 8. The master-branch CI run for the exact
  merge commit completed successfully, including Backend checks, Frontend checks,
  and both production container builds.
- A clean isolated checkout of `a0425ff` was installed from both lockfiles under
  Node 24.19.0 on September 8. It passed 127 backend tests, 39 frontend tests,
  both linters, TypeScript checks, and the production frontend build. The real
  worktree source audit also passed with 205 source files inspected.
- The local Docker daemon was not running during this refresh, so container builds
  were not repeated locally. The authoritative master-branch Container checks job
  succeeded for `95191a9`.
- A read-only production recheck on September 9 returned `status: ok` and
  `database: connected` from `/api/health`; the public frontend returned `200`.
- The backend deployment is live at merged commit `95191a9`. Its configured key
  names include the database, authentication, cookie/CORS, GitHub App, private-key,
  webhook-secret, API-version, and connection-state settings required by the release.
  Secret values were not displayed or copied. `APP_BASE_URL` safely falls back to
  the first configured `CORS_ORIGIN`; optional invitation email delivery is disabled
  unless its provider settings are added.
- The frontend deployment contains only `NODE_VERSION`, `VITE_API_BASE_URL`, and
  `VITE_DEMO_MODE`; no backend credential key is configured there.
- Production served the new CSS asset `index-BIXoRFHi.css` on September 7.
  Asset presence alone does not prove the authenticated workflows work.
- Production ticket pages previously displayed the new commit and PR as verified
  GitHub activity. This proves linking for those events, not every integration path.
- The desktop, tablet, and mobile local preview was approved on September 9 before
  this follow-up commit. No push was authorized as part of that approval.

## Milestone implementation evidence

| Phase | Durable implementation | Automated and UI evidence | Current state |
| --- | --- | --- | --- |
| 1. Secure connection | Migration `015_github_app_connection.sql`; authenticated connect and one-time callback routes; server-only App credentials | `githubClient.test.js` and connection-state/callback replay coverage in `githubIntegration.test.js` | Complete and deployed |
| 2. Repository assignment | Installation repository discovery and project-scoped selection route | Repository ownership, reassignment, and cross-user denial coverage in `githubIntegration.test.js`; `GitHubIntegration.test.tsx` | Complete and deployed |
| 3. Historical sync | Bounded commit, pull-request, check, deployment, and release import with recorded sync state | Bounded/idempotent history, partial failure, and truthful metric coverage in `githubIntegration.test.js`; `ProjectDevelopment.test.tsx` | Complete and deployed |
| 4. Signed webhooks | Migration `016_webhook_processing.sql`; raw-body webhook endpoint and normalized receipts | HMAC test vector, invalid-signature rejection, deduplication, lifecycle, event normalization, payload limit, and no-raw-payload coverage in `githubWebhook.test.js` | Complete and deployed |
| 5. Ticket linking and UI | Exact project-key links, project development history, task development history, and command metrics | Project-scoping and exact-key coverage in `githubWebhook.test.js` and `githubIntegration.test.js`; `TaskDetail.github.test.tsx` and `ProjectDevelopment.test.tsx` | Complete and deployed |
| 6. Durable ticket lifecycle | Migrations `017_task_acceptance_criteria.sql` and `018_archive_lifecycle.sql`; criteria and reversible archive APIs | `acceptanceCriteria.test.js`, `archiveLifecycle.test.js`, `AcceptanceCriteria.test.tsx`, and `ArchivePage.test.tsx` | Complete and deployed |
| 7. Secure invitations | Migration `019_project_invitations.sql`; expiring hashed tokens, exact-email acceptance, decline, and revocation routes | `projectInvitations.test.js`, `invitationMailer.test.js`, `InvitationPage.test.tsx`, and `ProjectModal.test.tsx` | Complete and deployed; production mutation smoke pending |
| 8. Workflow automation | Migration `020_project_workflow_automation.sql`; owner-managed forward-only rules applied only to verified future webhooks | `projectWorkflow.test.js`, signed webhook transition/idempotency coverage in `githubWebhook.test.js`, and `ProjectWorkflowSettings.test.tsx` | Complete and deployed; live future-webhook smoke pending |
| 9. Identity and recovery | Migration `021_github_identity_and_recovery.sql`; eligible-member mappings and bounded GitHub redelivery routes | `githubOperations.test.js` and identity/recovery coverage in `GitHubIntegration.test.tsx` | Complete and deployed; production mutation smoke pending |
| 10. Release audit | Source audit, provider-neutral release checklist, backup/restore runbook, responsive workflow fix, and release evidence | 127 backend tests, 39 frontend tests, lint, TypeScript, build, merge-commit CI/container checks, source audit, and 1440/768/390 viewport audit | In verification |

## Headers verified September 8

The public frontend response now includes all six required protections:

- Content-Security-Policy with a fixed production API origin and frame ancestors denied.
- `X-Frame-Options: DENY`.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- `Permissions-Policy: camera=(), geolocation=(), microphone=()`.
- Render-managed HSTS.
- `X-Content-Type-Options: nosniff`.

The login page rendered successfully with no browser warning or error logs after
the rules were applied. These rules are configured on the frontend static site;
`frontend/nginx.conf` remains the equivalent policy for container deployments.

The deployed rules use these values for all routes and assets:

| Header | Required policy |
| --- | --- |
| Content-Security-Policy | Self-hosted scripts; deny objects and framing; restrict connections to the actual API origin; permit the app's inline styles and data images/fonts as needed. Validate sign-in and GitHub connection after applying. |
| X-Frame-Options | `DENY` |
| Referrer-Policy | `strict-origin-when-cross-origin` |
| Permissions-Policy | `camera=(), geolocation=(), microphone=()` |

Response headers, rather than a CSP meta tag, provide framing protection.

## Workflow interactions verified

- Migrations 019–021 are operational. Project membership/invitation data,
  project workflow rules, and GitHub identity/recovery data all loaded from the
  deployed API on September 8. The merged backend is live at `95191a9`; its Docker
  command runs `migrate` and `migrate:status` before `start` using `&&`, so the API
  cannot start when either command exits unsuccessfully.
- Pointer drag-and-drop was verified locally on September 8 by moving LAUNCH-3
  from Backlog to Released. The board confirmation appeared and the lane counts
  changed from 3/3/3 to 2/3/4. Menu-based moves were also verified locally.
- On September 9, the demo workflow was exercised in headless Edge at 1440x900,
  768x1024, and 390x844. Every viewport rendered all nine tickets, exposed all three
  lane selectors, switched Backlog, In progress, and Released through URL-backed
  filters with three matching tickets each, restored All lanes, and produced no
  console errors or document-level horizontal overflow.
- The 390-pixel visual check found that selecting Released could leave the focused
  lane off-screen because the mobile stage header retained the board's 720-pixel
  minimum width. The mobile header now fits all three selectors into the viewport
  while the unfiltered three-column card area keeps its intentional internal
  scroller. The complete viewport audit passed again after the fix.

## Still unverified

- Backup and restore readiness.
- Mutating production smoke cases: invitation creation/acceptance/revocation,
  owner/editor/viewer denial, a real future-webhook workflow transition, identity
  mapping, and failed-webhook recovery. Their automated integration tests pass,
  and the deployed read paths are healthy, but running these cases would create
  or change production records.
- A fresh external npm advisory lookup remains pending explicit approval because it
  transmits dependency metadata to npm. The merge-commit CI production audit passed.

The production session redirected to login on September 8. Resume authenticated
verification after the owner signs in. Do not mark the overall milestone complete
or tickets Shipped based only on CI or the health endpoint.
