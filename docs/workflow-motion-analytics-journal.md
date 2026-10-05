# Workflow motion and analytics — local implementation

## Request
Make issue movement feel immediate and make delivery analytics more useful and engaging without inventing historical metrics.

## Changes
- Optimistic lane movement, individual saving indicators, concurrent saves for different tickets and status rollback on failure.
- Background reconciliation preserves pending moves and visual ordering; no full-board loading flash after saving.
- Project-scoped workflow snapshot with links to its lanes, open-work age bands and owner workload.
- Completion-update line/area chart with keyboard-focusable points and an accessible daily-count table.
- All task pages are loaded for analytics; stale responses cannot overwrite a newer project selection. Previous-scope charts are hidden while updating.
- Responsive layouts and reduced-motion support, with no new chart dependency.

## Verification
- Frontend lint, TypeScript and production build pass. The build retains a non-blocking bundle-size warning.
- Final full frontend suite: 78 tests passed across 27 files. Targeted board/chart/data-scope suite: 14 tests passed.
- Browser checks in session-only local demo: moved LAUNCH-3 from Backlog to In progress, observed immediate destination placement and saving indicator, then restored it. Project analytics filtering and chart-to-scoped-board navigation worked.
- Visually checked desktop flow cards and narrow-screen stacked layout, line chart and ledger. No production tickets were changed.

## Boundaries
Counts are issues, including hierarchy levels, not effort/productivity. Age is since creation, not time in stage. Completion updates use last-updated dates, not an audited historical transition series. True cumulative flow/cycle-time metrics require dedicated historical data aggregation and validation.

Changes remain local, uncommitted and unpushed pending preview approval.
