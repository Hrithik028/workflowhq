# CI security fix and delayed loading — 6 October 2026

## Failure and targeted correction

PRs 69–72 passed frontend checks, backend lint/tests and database migrations, but
failed `npm audit --omit=dev --audit-level=high`. The shared locked Express dependency
proxy-addr 2.0.7 is affected by GHSA-jqcg-44mw-7w3h, a critical IP-spoofing advisory.
Only proxy-addr is updated to the compatible patched version 2.0.8, using npm's
verified distribution integrity. No security checks, proxy configuration or rate
limits are weakened. The backend production-dependency audit now reports zero
vulnerabilities. Regression tests reject arbitrary clients under a short-prefix
IPv4-mapped trust subnet and preserve a correctly scoped mapped subnet.

## Loading behaviour

- Branded loading indicators appear only after three continuous seconds of waiting.
- Finishing the wait immediately removes the indicator; there is no exit hold.
- A route change starts a fresh delay; an old overlay cannot carry into another tab.
- Independent short requests do not accumulate into a visible loader.
- The central indicator captures read requests started in the first 500ms of opening
  a page. Once capture closes, later reads cannot restart or prolong that indicator.
- Writes (including ticket moves) and session refresh requests are excluded from the
  central indicator. Their local saving/auth feedback remains in place.
- Concurrent initial page reads share the active wait until the last one finishes.
- Old page requests are not adopted by a new navigation. Capture-window timers and
  visibility timers are cancelled on unmount, including StrictMode cleanup.
- Session restoration remains access-protected throughout the delay.
- Workspace section loaders use the same delay; this applies to the workspace phases.
- Transparency, compact card sizing and reduced-motion styling are unchanged.

The standalone static design preview deliberately shows the card immediately.
`/loading-preview.html?theme=dark&timing=true` provides a separate local-only timing
simulation: 250ms fast change, eight-second slow change, and immediate completion.
It does not call an API or save records. The preview component is separated from
the entry point to keep React refresh and lint clean.

## Local verification

Existing backend suite plus new proxy-trust regressions pass; full frontend suite
passes 108 tests. Lint, TypeScript and build are required before publishing. Browser
MCP verifies a real project tab change without a loader, the 250ms simulation with
no indicator, a slow wait with the delayed card, and immediate disappearance on
completion. Only local QA records are used; no production records or user access change.

All four separate PR branches require this lockfile fix. New CI runs must be checked
after publication; local passing results do not imply GitHub CI or deployment is complete.

## Follow-up: less intrusive loading

The user reported that loading still interrupted ordinary work. The earlier delay
only reduced flashing: every API call could still trigger the global screen. The
follow-up changes the delay to three seconds and restricts the global screen to the
initial navigation read burst described above. Section/auth loaders use the same
three-second delay, but protected content still stays hidden until auth completes.
This is intentionally a bounded capture window, not full router data-loader tracking;
reads started more than 500ms after navigation rely on the page's own loading state.
Verification: all 112 frontend tests pass, including API read/write classification,
delayed visibility, concurrent reads, old-navigation disposal, immediate completion,
and background-request exclusion. Targeted ESLint, TypeScript and production build
pass (the existing large-bundle warning remains). Browser MCP verifies the local
250ms preview without a loader, an eight-second wait displaying the card after
three seconds, and immediate hiding on completion. Screenshot evidence is kept
outside the repository at the temporary workflowhq-three-second-loader.png path.
Theme contrast and drag-and-drop refinements are separate pending work, not part
of this loading-only update. Published as a focused loading-fix PR; merging and production deployment remain separate.
