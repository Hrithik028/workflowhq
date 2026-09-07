# WorkflowHQ security policy

WorkflowHQ is currently a developer beta. It has automated authorization, webhook, migration, and
session coverage, but it has not undergone an independent penetration test or security audit.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use the repository's **Security** tab to
submit a private vulnerability report. Include the affected route or feature, reproduction steps,
impact, and any safe proof of concept. Never include real access tokens, passwords, private keys, or
customer data.

## Security boundaries

- Access tokens are short lived; refresh tokens are hashed, rotated, and stored in `HttpOnly`
  cookies.
- Global permissions and project membership are enforced by the API, not trusted from the browser.
- GitHub App credentials and installation tokens remain server-side.
- Webhooks are verified against the exact raw body with HMAC-SHA-256 and deduplicated by GitHub's
  delivery identifier.
- Raw webhook request bodies are not retained. Failed events store only a sanitized receipt.
- Repository events can link only to an exact issue key in a project assigned to that repository.
- Workflow automation moves tickets forward only and is disabled for historical imports.
- The production frontend sends CSP, frame-denial, referrer, permissions, HSTS, and MIME-sniffing
  protection headers.

## Known beta limitations

- Multi-factor authentication and enterprise single sign-on are not implemented.
- There is no formal bug-bounty or guaranteed response-time program.
- Operational backups, retention, and incident response depend on the production operator.
- GitHub delivery recovery is bounded by GitHub's delivery availability window.

Use [docs/developer-beta-release-checklist.md](docs/developer-beta-release-checklist.md) before each
production release.
