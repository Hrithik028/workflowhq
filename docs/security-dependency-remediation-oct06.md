# Dependency security remediation - 6 October 2026

## Scope and release status

- Repository: `Hrithik028/workflowhq`.
- Baseline: freshly fetched `origin/master`, commit `902e618`.
- Isolated local branch: `security/dependency-vulnerability-fixes`.
- Separate branch publication is approved by the user. These changes are not
  merged or deployed; GitHub CI and default-branch rescans remain release gates.
  Existing documentation, performance and workspace-isolation work is not included
  or modified.
- This is a dependency-alert remediation, not a certification that the entire
  application is free of security vulnerabilities.

## Findings

GitHub's live API returned **11 open Dependabot alerts**: three high, five medium
and three low. All were classified as development dependencies. The same check
returned **zero open default-branch code-scanning alerts**. A subsequent check of
PR #76's merge ref found two high-severity findings in the documentation preview
script. Their fixes and 14 regression tests are separate local changes on
`docs/workflowhq-showcase`, recorded in that branch's
`docs/media/security-fix-oct06.md`; they are not part of the dependency patch.

The full npm audit also found an unpatched `braces` vulnerability in the backend's
development watcher chain. Before remediation, npm reported three vulnerable
package entries for the frontend and six for the backend. These package counts
include transitive effects and are not additional independent GitHub alert counts.

Production-only CI audits had excluded development dependencies and therefore
could pass despite the alerts. Development and build dependencies still need
security updates; their classification does not make the findings harmless.

## Changes

| Package                                       | Where                | Before                        | After   | GitHub alerts covered        |
| --------------------------------------------- | -------------------- | ----------------------------- | ------- | ---------------------------- |
| `source-map-js`                               | Backend and frontend | 1.2.1                         | 1.2.2   | #21, #22                     |
| `brace-expansion`                             | Backend and frontend | 5.0.9                         | 5.0.12  | #6, #19                      |
| `moment`                                      | Backend              | 2.30.1                        | 2.31.0  | #7                           |
| `undici`                                      | Frontend             | 7.29.0                        | 7.30.0  | #9, #10, #11, #12, #15, #16  |
| `nodemon` and its `chokidar` / `braces` chain | Backend              | nodemon 3.1.14 / braces 3.0.3 | Removed | Additional npm audit finding |

Updates stay within the existing dependency ranges; no new overrides or major
application-library upgrades were introduced. `undici` 7.30.0 is a compatible
7.x release above the advisory's patched minimum of 7.29.1.

The `braces` advisory has no patched release listed. Instead of accepting npm's
suggested nodemon downgrade, remove the unnecessary dependency chain and use
`node --watch src/server.js` for `npm run dev`. Node's native watch mode is stable
on the project's existing Node 22+ requirement. Production `npm start` is unchanged.

Both CI jobs and the developer release checklist now use
`npm audit --audit-level=low`: production and development dependencies are checked,
and findings at any reported severity fail the audit. Dependabot's update schedule
and PR limits are unchanged.

## Verification

Tested from fresh, separate dependency installs using Node 24.19.0 and npm 10.2.3.
Installs used `npm ci --ignore-scripts` to avoid running dependency lifecycle scripts.

- Backend full npm audit: **zero known vulnerabilities**, exit 0.
- Frontend full npm audit: **zero known vulnerabilities**, exit 0.
- Backend: **39 test files, 245 tests passed**.
- Frontend: **32 test files, 103 tests passed**.
- Backend and frontend ESLint: passed.
- Frontend TypeScript check: passed.
- Frontend production build: passed.
- Native watch-mode smoke test: temporary fixture executed, file edit detected,
  process restarted and updated output observed; watcher stopped and fixture removed.
- Release audit including this journal: 338 source files inspected, passed.
- Changed-file formatting: passed, preserving existing CRLF line endings.
- `git diff --check`: passed.

Frontend tests emit jsdom's existing optional-canvas warning but pass. The master
baseline still emits the >500 kB build-chunk warning; the already-pushed separate
`perf/on-demand-page-loading` branch addresses that performance issue. It is not a
dependency vulnerability and is intentionally not mixed into this security change.

No production accounts, database records, access roles, migrations or environment
variables were changed. PostgreSQL-backed deployment migrations, Linux CI and
container builds have not been rerun as part of this local verification.

## Next steps

1. Publish the approved separate security branch and create its PR.
2. Run GitHub CI, including the expanded dependency audits and container checks.
3. Review and merge only after approval; then verify deployment and rescans.
4. Confirm the 11 Dependabot alerts close after GitHub sees the fixed lockfiles on
   the default branch. Local remediation does not close remote alerts by itself.

## Primary references

- [source-map-js advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).
- [brace-expansion advisory](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr).
- [moment advisory](https://github.com/advisories/GHSA-4p3w-j4w9-5jqw).
- [undici TLS advisory](https://github.com/advisories/GHSA-w293-vg96-wgc3).
- [Unpatched braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
- [Node native watch mode](https://nodejs.org/api/cli.html#--watch).
