# WorkflowHQ developer-beta release checklist

This checklist is intentionally provider-neutral. It documents what the application requires
without putting hosting or database vendor instructions in the public project page.

## 1. Release scope

- Confirm the intended branch and review every changed and untracked path.
- Confirm migrations are sequential and immutable. This release adds:
  - `019_project_invitations.sql`
  - `020_project_workflow_automation.sql`
  - `021_github_identity_and_recovery.sql`
- Confirm the frontend screenshots match the local build.
- Do not commit `.env` files, PEM files, database exports, logs, tokens, or invitation links.

## 2. Required backend configuration

Set secrets only on the backend service:

- `DATABASE_URL`, `DATABASE_SSL`, and `DATABASE_SSL_REJECT_UNAUTHORIZED`
- `JWT_SECRET`, `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_DAYS`, and `REFRESH_COOKIE_NAME`
- `CORS_ORIGIN`, `COOKIE_SAME_SITE`, `TRUST_PROXY`, and `APP_BASE_URL`
- `GITHUB_INTEGRATION_ENABLED=true`
- `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_CLIENT_ID`, and
  `GITHUB_APP_CLIENT_SECRET`
- `GITHUB_APP_PRIVATE_KEY_BASE64` and `GITHUB_WEBHOOK_SECRET`
- `GITHUB_API_VERSION=2026-03-10`, which is a currently supported
  [GitHub REST API version](https://docs.github.com/en/rest/about-the-rest-api/api-versions)

For invitation email delivery, also set `INVITATION_EMAIL_PROVIDER=resend`,
`INVITATION_FROM_EMAIL`, and `RESEND_API_KEY`. Leave the provider disabled when no verified sender
is configured; owners can still copy the secure invitation link.

Set only public build configuration on the frontend:

- `VITE_API_BASE_URL=https://your-api.example/api`
- `VITE_DEMO_MODE=false`

Never put GitHub, database, JWT, invitation-provider, or webhook secrets in the frontend service.

## 3. GitHub App configuration

- Callback URL: `https://your-api.example/api/github/callback`
- Webhook URL: `https://your-api.example/api/github/webhooks`
- Webhook secret: the same strong value as the backend `GITHUB_WEBHOOK_SECRET`
- Wildcard callback matching: off
- Repository permissions:
  - Metadata: read
  - Contents: read
  - Pull requests: read
  - Checks: read
  - Deployments: read
- Account and organization permissions: none
- Subscribed events:
  - Installation
  - Installation repositories
  - Push
  - Pull request
  - Check run
  - Deployment status
  - Release

Grant only the repositories that should be visible to WorkflowHQ. Repository assignment to a
WorkflowHQ project is a separate step inside the application.

## 4. Automated release gate

Run from the repository root:

```bash
node scripts/release-audit.mjs

cd backend
npm ci
npm run lint
npm test
npm run migrate
npm run migrate:status
npm audit --omit=dev --audit-level=high

cd ../frontend
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev --audit-level=high
```

CI also builds both production containers after the application checks succeed.

## 5. Pre-deploy checks

- Back up the production database and complete the disposable-database verification in
  [the PostgreSQL backup and restore runbook](database-backup-restore-runbook.md).
- Confirm the database role can run migrations but is not a cluster superuser.
- Confirm TLS certificate verification remains enabled for the production database.
- Confirm the frontend origin exactly matches `CORS_ORIGIN` and `APP_BASE_URL`.
- Confirm secure cross-site cookie settings are used when frontend and backend use different sites.
- Confirm `ALLOW_DEMO_SEED=false` and `VITE_DEMO_MODE=false`.
- Run `npm run migrate:status` against the configured database without printing its URL.
- Verify the platform owner and at least one recovery administrator account.

## 6. Post-deploy smoke test

1. Verify `GET /api/health` returns `200`.
2. Sign in, refresh the session, sign out, and confirm the revoked session cannot refresh again.
3. Create a project, invite an editor, accept with the exact email, and verify outsider denial.
4. Create a parent ticket, child ticket, and persisted acceptance criteria.
5. Archive and restore the ticket and project; confirm hierarchy and GitHub evidence remain intact.
6. Connect the GitHub App, refresh repositories, select one repository, and assign it to the test
   project.
7. Create a ticket and put its exact issue key in a branch, commit, and pull-request title.
8. Confirm the push and pull request appear on the ticket and project development pages.
9. Confirm enabled rules move the ticket forward once, while a history import does not move it.
10. Map the observed GitHub actor to a project member and confirm old and new activity show the
    member name with the GitHub login retained.
11. Use a controlled failed webhook receipt to verify the redelivery cooldown and audit entry.
12. Select Backlog and Released on the workflow board, use All lanes and browser Back, and
    confirm project/sprint filters and every matching ticket are retained (WHQ-21).
13. Move a ticket with the Move to menu and by dragging to a lane; verify persistence after
    refresh, field preservation, and viewer denial (WHQ-22).
14. Inspect desktop and mobile layouts and confirm CSP/security headers are present.

GitHub documents that failed deliveries are not retried automatically and can be redelivered only
for the past three days. WorkflowHQ's recovery boundary follows that documented
[redelivery window](https://docs.github.com/en/webhooks/testing-and-troubleshooting-webhooks/redelivering-webhooks).

## 7. Release decision

Ship only when:

- every required CI job is green;
- the migration status has no pending or unknown file;
- the local preview has been approved;
- the source audit contains no secret or private runtime artifact;
- the post-deploy smoke test has an owner and a rollback decision.

If any condition fails, keep the feature flag disabled or roll back the application image. Do not
roll back an already-applied migration by editing its SQL file.
