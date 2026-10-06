# Showcase validation — 6 October 2026

This task changes documentation and media only. Existing staged/unstaged application work
was left in place; it is not part of this showcase's publishing scope.

## Checks completed

- Read the existing README and source boundaries before describing capabilities.
- Checked the current master baseline `902e618`; pending feature branches are not described
  as shipped. Production deployment was not certified by this documentation task.
- Used Browser MCP to capture eight actual built-in-demo screens in light appearance.
  Sample people and GitHub signals are clearly disclosed. No private accounts/settings captured.
- Added editable system and AI approval diagrams, including component symbols and text labels.
  Generic symbols identify components; they are not represented as official vendor logos.
- Rendered and visually inspected both diagrams and the video poster.
- Rendered the README locally and inspected its headings, feature table and architecture.
  Verified the Architecture anchor and native browser video playback.
- Verified all 37 local Markdown file links in the refreshed README and its new guides.
- Parsed/checked both Node media tooling scripts.
- Encoded a 72-second H.264/yuv420p video at 1440×960, 24 fps with fast-start metadata.
  It is approximately 1.3 MB, below the repository's 5 MiB individual-file limit.
- Decoded the generated video using FFmpeg; regenerated it after adding symbols.
- Source release audit passed. Existing application tests were not rerun for a docs-only task.

## Publishing gate

The user approved publishing the reviewed README, screenshots, diagrams and captioned video
on 6 October 2026. The `docs/workflowhq-showcase` branch is based on master `902e618`
and contains documentation/media only. Unrelated application changes and pending workspace
migrations are excluded. This approval does not authorize merging or certify production deployment.

Before publication, the isolated branch passed the source release audit, local Markdown link
checks (36 references across the new documents), and both media scripts' Node syntax checks.
Its frontend build also passed; as expected, this documentation-only branch retains master's
large-bundle warning. The separate `perf/on-demand-page-loading` branch resolves that warning.

The named brag skill was not available; no claim is made that it was used.
