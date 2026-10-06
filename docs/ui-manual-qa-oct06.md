# Manual UI review — 6 October 2026

Browser MCP reviewed the local application with the real disposable PostgreSQL QA
database. No production records, real users' permissions, paid AI providers, Render
settings, or GitHub installation settings were changed. Synthetic local notifications
were added to test populated read/unread states. Existing project and workspace access
were left intact.

## Visual coverage

- Desktop default viewport, 900px tablet, and 390px mobile layouts.
- Light and dark appearance using the actual theme toggle.
- Workspace switcher and administration: heading font, sidebar select contrast,
  input/button sizes, wrapped forms, membership and policy display.
- Project workflow editor: five ordered stages, category selectors, enabled/disabled
  controls, safety note, transition matrix and GitHub rule display.
- Engineering board: custom stage headers, focused lanes, issue creation preselected
  to QA, card labels, priority contrast and intentional inner horizontal scrolling.
- Ticket detail and editor: custom QA status, readable labels/placeholders, mobile
  one-column form, optional fields, dates, modal actions and disabled transitions.
- Hierarchy: exact Review/QA labels, both themes, mobile filters and scrollable table.
- Project register and roadmap: accessible dark table header/links, wrapped project
  title, theme-coloured timeline dots, dependency controls and exact stage labels.
- Notifications: populated read/unread rows, long text wrapping, date layout, unread
  filter and opening a notification's linked ticket.
- Loading preview in both themes: 340px card, transparent screen and visible ribbon.
  Inline workspace loading uses a compact section without the full-page ribbon.

## Corrections made

1. Aligned workspace and notification headings with the product's serif display font.
2. Replaced undefined/fallback workspace colours with valid theme colours; kept the
   permanently dark sidebar consistent in both modes.
3. Fixed mobile sidebar layout so the workspace selector is not squeezed beside navigation.
4. Styled stage controls consistently instead of native grey buttons; aligned their rows.
5. Replaced hard-coded light-only workflow feedback/footer colours with theme tokens.
6. Fixed low-contrast dark ticket form labels, optional labels, placeholders and date icons;
   used readable 14px input text and one-column mobile form grids.
7. Fixed the dark project-register header and links, medium-priority contrast, and the
   roadmap's hard-coded orange dot.
8. Added compact inline loading and regression coverage; added roadmap stage-identity
   coverage on both the API and frontend.
9. Applied contrasting primary-button text independently in light and dark themes.

## Verification and limits

Full final backend suite: 269 tests passed. Full final frontend suite: 103 tests passed.
The independently exported workspace phase passes 265 backend and 100 frontend tests.
The two prerequisite phases pass their focused workflow/roadmap backend tests.
Real PostgreSQL passes all migrations, atomic approval/rollback and quota tests,
plus workspace roots, cross-tenant links and stage/move consistency checks.
ESLint, TypeScript, source audit and Vite build passed; the existing >500KB main-bundle
warning remains advisory. New source contains no screenshots, secrets or runtime databases.

This is local browser/visual QA, not a production deployment test or a WCAG certification.
Board and hierarchy tables intentionally scroll horizontally when multiple columns cannot
fit on a small display. Ownership transfer, access changes, destructive actions, provider
errors and invitation redemption were not re-executed in this visual pass; their earlier
local and automated checks remain documented in workspace-release-qa.md.

## Publishing

User approved pushing after visual testing. Keep feature phases separate and do not merge:
custom-workflow foundation, roadmaps/dependencies, workspace isolation/root hardening,
then additional stages and their visual polish. Notifications/loading already exist on master.
The later PRs are stacked on their prerequisite branches; merge in order, retargeting each
remaining PR to master after its base lands. Back up and rehearse migrations before deployment.

Publishing review also preserved master's historical 031_notifications.sql unchanged.
The pending idempotent 034 notification migration remains for compatibility with this
local migration sequence; no already-applied SQL migration is removed or rewritten.
The test adapter verifies that 034 is byte-equivalent after newline normalization to
031 before skipping that duplicate in pg-mem, which cannot plan repeated conditional
table creation. Real PostgreSQL still executes both files and passes the fresh-schema test.
