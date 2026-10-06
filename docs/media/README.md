# WorkflowHQ showcase assets

## What these files show

Captured on 6 October 2026 through Browser MCP from a clean local application export of
`d7f205f`, subsequently merged into master as `902e618` (PR #75).
The screenshots use the **built-in session-only demo**, in light appearance, at the browser's
normal viewport. Names, dates, metrics, pull requests, checks and deployments are sample data.
No production records or user permissions were changed. No provider credentials, account
screens, Render settings, paid LLM calls or real webhook delivery tests were captured.

The MP4 is a **captioned, edited product walkthrough made from real UI screenshots and
explanatory diagrams**, not a live screen recording. There is no audio. The visible text,
separate WebVTT track and transcript carry the story. The final diagram scenes describe source
boundaries, not a visual proof that external integrations succeeded in production.

## Assets

- `../../screenshots/showcase/*.png`: eight original application captures, no data substitution;
  `architecture-browser.png` additionally records the browser-rendered diagram QA.
- `architecture.svg`: editable system diagram.
- `ai-approval-flow.svg`: editable human approval flow.
- `workflowhq-demo.mp4`: 72-second H.264 video, fast-start metadata, below the 5 MiB file limit.
- `demo-poster.png`: clickable README thumbnail.
- `workflowhq-demo.vtt`: optional captions.
- `demo-transcript.md`: accessible chapters and narration text.
- `demo-manifest.json`: scene sources, timing and provenance.
- `preview.html`: local video/diagram/gallery preview.

GitHub's README renderer is not assumed to run HTML video players. The README uses a clickable
poster and a direct MP4 link. Depending on the GitHub client, the file view may play or download
the video. The local preview uses standard browser video controls.

## Rebuild

Use Node.js, [Sharp](https://sharp.pixelplumbing.com/) and
[FFmpeg](https://ffmpeg.org/). Sharp is a documentation-tool dependency, not an application
runtime dependency. Install it in an isolated tool environment or use an available workspace
runtime; make it resolvable by Node. Do not commit tool binaries or a tool-specific node_modules.

```bash
node scripts/build-showcase-media.mjs --ffmpeg /absolute/path/to/ffmpeg
```

If FFmpeg is on PATH, omit the flag. The script renders temporary captioned frames, encodes
each chapter, concatenates them, generates the poster/captions and removes its own temporary
directory. It rejects scene sources outside the repository and videos over 5 MiB.
Edit the manifest to change chapters; replace screenshots only after checking the real UI.
The source captures remain unchanged by rendering.

## Preview locally

From the repository root, use any localhost-only static server. For example:

```bash
python -m http.server 5197 --bind 127.0.0.1
```

Open `http://127.0.0.1:5197/docs/media/preview.html`. Do not expose the development checkout
publicly. This documentation page does not call the application API or external services.
For a rendered Markdown preview with an allowlisted localhost file server and MP4 range
support, make the isolated `marked` dependency resolvable and run
`node scripts/preview-showcase.mjs`; open `http://127.0.0.1:5198/README.md`.

## Release notes

The README status table is tied to the checked master revision, not a promise that every
pending feature is deployed. Workspace isolation, additional stages and roadmaps must keep
their release gates visible until merged and validated.
The named "brag" skill was unavailable in this session; this package uses an evidence-backed
product-showcase approach rather than claiming that skill ran.
