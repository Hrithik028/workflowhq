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

- Branded loading indicators appear only after one continuous second of waiting.
- Finishing the wait immediately removes the indicator; there is no exit hold.
- A route change starts a fresh delay; an old overlay cannot carry into another tab.
- Independent short requests do not accumulate into a visible loader.
- Concurrent requests share the active wait until the last one finishes.
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
