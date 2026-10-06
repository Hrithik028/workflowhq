# README preview security corrections - 6 October 2026

## What failed

PR #76 (`docs/workflowhq-showcase`) passed backend, frontend and container CI. Its
CodeQL analysis workflow also ran successfully, but the separate security-results
check failed with two new high-severity findings in `scripts/preview-showcase.mjs`:

- [Alert #22: file-system race](https://github.com/Hrithik028/workflowhq/security/code-scanning/22):
  metadata was checked using a pathname, then that pathname was reopened for reading.
- [Alert #21: incomplete multi-character sanitization](https://github.com/Hrithik028/workflowhq/security/code-scanning/21):
  heading-ID generation attempted to remove HTML tags using a regular expression.

These are findings on the pull-request merge ref, not the default branch. Checking
only default-branch alerts or the analysis workflow's exit status misses this distinction.

Older CI failures on four feature branches had a different cause: the critical
`proxy-addr` audit. Latest master `2d50cce` already locks the patched version 2.0.8;
its backend, frontend, container and CodeQL analysis jobs pass.

## Local changes

1. Open each preview asset once. Use `fstatSync`, `readFileSync` and the media stream
   against that same descriptor. A pathname replacement cannot redirect the read.
2. Close descriptors on every early return or error; transfer ownership explicitly
   to media streams, which close on completion, error or client disconnect.
3. Remove regex-based HTML-tag stripping. Heading IDs use a single-character
   allowlist of letters, numbers, whitespace and hyphens, followed by whitespace
   normalization. Plain README headings and duplicate-anchor suffixes are preserved.
4. Keep the preview strictly local and read-only. Enforce its no-script CSP for all
   responses, add `nosniff`, and block objects and form submission. This renders
   trusted repository documentation; it does not claim to sanitize arbitrary HTML.
5. Preserve media seeking and HEAD responses; reject malformed, reversed and unsafe
   numeric ranges, and handle empty assets without an invalid stream range.
6. Export an import-safe server factory and add dependency-free Node regression
   tests to CI. Importing the script no longer starts a server or requires optional
   `marked` tooling. Direct CLI startup remains unchanged.

## Verification

```bash
node --test scripts/preview-showcase.test.mjs
```

**14 tests passed** using Node 24.19.0. Coverage includes heading IDs, restrictive
headers, read-only methods, allowed paths, encoded traversal, missing files,
malformed URLs, full media responses, bounded/open-ended ranges, HEAD, empty assets
and real pathname replacement during both Markdown and media reads. The replacement
tests confirm that the original open file, not its replacement, is returned.

An additional HTTP smoke test using the actual `marked` 18.1.0 renderer passed:
README architecture/run-locally anchors, the real MP4's 64-byte partial response
and the gallery HTML with restrictive CSP were verified. The optional parser was
installed only in temporary tooling, not as an application dependency. JavaScript
syntax checks, `git diff --check` and the release audit (364 source files) passed.

The user approved publication of this follow-up to the existing README PR. GitHub
CodeQL must rescan the updated PR before the security-results check can be confirmed
green. No merge is authorized. No alert dismissals, weakened scanning rules,
production changes or application dependency changes were made here.

## Primary guidance

- [CodeQL file-system race guidance](https://codeql.github.com/codeql-query-help/javascript/js-file-system-race/).
- [CodeQL incomplete sanitization guidance](https://codeql.github.com/codeql-query-help/javascript/js-incomplete-multi-character-sanitization/).
