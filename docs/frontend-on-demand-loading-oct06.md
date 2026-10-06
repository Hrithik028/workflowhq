# Frontend on-demand loading — 6 October 2026

Status: verified release candidate on `perf/on-demand-page-loading`, based on master `902e618`. The user approved pushing on 6 October 2026. This is not a merge or production-deployment certification.

## What was causing the warning?

The application imported almost every page directly from `App.tsx`. Page-specific API requests generally ran after navigation, but the code for those pages was still part of the initial JavaScript download. Master `902e618` has a 546.74 kB production entry bundle after minification, exceeding Vite's default 500 kB warning threshold.

## What changed

- Route pages and the authenticated layout now use module-scope `React.lazy` imports. A page's code loads when that route is rendered, not simply because the application starts.
- Ticket and AI planning editors load when opened. Their existing permission checks and submission flows are unchanged.
- The decorative public-page ribbon is asynchronous and does not block the page content.
- QR generation was already loaded dynamically; that implementation is retained.
- A shared icon chunk reduces small duplicate icon requests. Vite/Rolldown keeps normal automatic chunk splitting for the rest of the application.
- Route boundaries preserve the mounted navigation shell. Path changes reset error state without remounting the entire shell, while query/filter changes do not reset it.
- Slow chunk downloads show the existing compact indicator only after 3,000 ms. Fast imports show no indicator. Failed imports offer an explicit reload action instead of a blank screen; there is no automatic reload loop.
- CI now checks the production manifest after building. It fails if a JavaScript chunk exceeds 500 kB, startup JavaScript exceeds 320 kB, pages become eagerly loaded, or the checked editor/page/decoration boundaries disappear.

## Measured build results

Sizes are minified bytes before gzip, rounded to decimal kB. They are download-size measurements, not guaranteed navigation timings.

| Measurement                                   |                    Before |     After |
| --------------------------------------------- | ------------------------: | --------: |
| Entry JavaScript                              |                 546.74 kB | 199.60 kB |
| Entry plus all static JavaScript dependencies |   not separately measured | 270.66 kB |
| Deferred page modules in the manifest         | no route-level boundaries |        25 |
| Vite warning for chunks over 500 kB           |                   present |    absent |

The warning limit was not increased. The shared runtime, session/bootstrap code and global styles still load initially. Analytics, Content, Inbox and Reports share one deferred module, so opening one of these also downloads that module's other exports. Browser module caching reuses downloaded chunks on subsequent visits; this does not prevent page data from refreshing through its existing API calls.

The earlier working-tree preview also contained unrelated pending workspace and roadmap work: its entry was 147.44 kB with 271.91 kB of total static startup JavaScript and 27 deferred page modules. The clean release branch excludes those unrelated features; the table above reports its own verified build. Entry sizes differ because the bundler places shared dependencies differently, not because those excluded features are being shipped here.

## Verification and journal

1. Captured the baseline production build warning and entry size.
2. Added route/editor boundaries and scoped icon grouping; inspected the production manifest's static import graph.
3. Updated the existing workflow editor test to await the now-asynchronous dialog instead of expecting it synchronously.
4. Added route-import tests proving unvisited AI/GitHub integration pages are not imported, slow/fast import timing tests, and a rejected-chunk recovery test.
5. Final review caught a potential shell remount from a pathname-based React key. Replaced it with error-state reset logic and added a test asserting the sidebar DOM and input state survive route navigation.
6. Verified lint, TypeScript, the production build, the chunk regression check, and the full frontend suite in the original working tree (37 files, 116 tests).
7. Manually tested that production-built local working-tree demo using browser MCP: landing, sign-in/demo, overview, workflow, opening/cancelling a ticket editor, tasks, ticket details, calendar, analytics, browser Back and revisiting the board. No browser warnings/errors were recorded in that session. No production records or paid AI calls were used.
8. Isolated only the on-demand-loading changes onto master `902e618`, without modifying the original staged/unstaged work. Repeated the build, manifest guard, TypeScript, ESLint and full frontend suite on the exact release branch: 34 files and 107 tests passed. The source release audit also passed. No backend source or migrations are included.

Slow-network feedback and rejected imports were checked deterministically in tests; the browser session was not artificially throttled. Real provider credentials and production integration behavior were not retested by this frontend performance change.

An additional whole-frontend Prettier check found style warnings in 75 files, mostly outside this change. This is not part of the current CI frontend checks. No broad formatting rewrite was made; functional verification and ESLint passed. The new boundary, regression tests and chunk-check script were formatted separately.

To reproduce with Node 22.13 or newer:

```powershell
cd frontend
npm run lint
npm run typecheck
npm run test
npm run build
npm run check:chunks
```

See [React lazy](https://react.dev/reference/react/lazy), [Vite async chunk loading](https://vite.dev/guide/features#async-chunk-loading-optimization) and [Rolldown code splitting](https://rolldown.rs/reference/OutputOptions.codeSplitting) for the underlying behavior.
