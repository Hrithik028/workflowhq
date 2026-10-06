import assert from "node:assert/strict";
import fs from "node:fs";
import { request } from "node:http";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { addHeadingIds, createShowcaseServer } from "./preview-showcase.mjs";

const fixture = fs.mkdtempSync(join(tmpdir(), "workflowhq-preview-security-"));
fs.mkdirSync(join(fixture, "docs/media"), { recursive: true });
fs.writeFileSync(join(fixture, "README.md"), "original readme");
fs.writeFileSync(join(fixture, "docs/race.md"), "original markdown");
fs.writeFileSync(join(fixture, "docs/media/sample.mp4"), "0123456789");
fs.writeFileSync(join(fixture, "docs/media/race.mp4"), "original media");
fs.writeFileSync(join(fixture, "docs/media/empty.vtt"), "");
const renderedInputs = [];
const server = createShowcaseServer({
  rootDirectory: fixture,
  renderMarkdown(markdown) {
    renderedInputs.push(markdown);
    return "<h2>Workflow preview</h2>";
  }
});
let address;

before(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  address = server.address();
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(fixture, { recursive: true, force: true });
});

function get(path, { method = "GET", headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port: address.port, path, method, headers }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () =>
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks).toString("utf8")
        })
      );
      res.on("error", reject);
    });
    req.on("error", reject);
    req.end();
  });
}

test("normal headings keep readable, unique anchor IDs", () => {
  assert.equal(
    addHeadingIds("<h2>Run locally</h2><h2>Run locally</h2>"),
    '<h2 id="run-locally">Run locally</h2><h2 id="run-locally-1">Run locally</h2>'
  );
});

test("nested markup and quotes cannot escape a generated heading ID", () => {
  const html = addHeadingIds('<h2><scrip<script>t> " x=1 & Café</h2>');
  const id = html.match(/id="([^"]*)"/)[1];
  assert.match(id, /^[\p{L}\p{N}-]+$/u);
  assert.ok(!id.includes("<") && !id.includes(">"));
  // Body markup is trusted documentation, not incorrectly advertised as sanitized HTML.
  assert.ok(html.includes('<scrip<script>t> " x=1 & Café'));
});

test("Markdown renders with script, form and object execution blocked", async () => {
  const res = await get("/");
  assert.equal(res.status, 200);
  assert.match(res.body, /id="workflow-preview"/);
  assert.equal(renderedInputs.at(-1), "original readme");
  assert.match(res.headers["content-security-policy"], /script-src 'none'/);
  assert.match(res.headers["content-security-policy"], /form-action 'none'/);
  assert.match(res.headers["content-security-policy"], /object-src 'none'/);
  assert.equal(res.headers["x-content-type-options"], "nosniff");
});

test("non-documentation paths are not served", async () => {
  assert.equal((await get("/backend/.env")).status, 404);
});

test("encoded traversal cannot escape the documentation root", async () => {
  assert.equal((await get("/docs/%2e%2e%2f%2e%2e%2foutside.md")).status, 403);
});

test("missing files, directories and malformed URI escapes fail safely", async () => {
  for (const path of ["/docs/missing.md", "/docs/media/", "/docs/%ZZ"]) {
    assert.equal((await get(path)).status, 404);
  }
});

test("only read-only GET and HEAD requests are accepted", async () => {
  const res = await get("/README.md", { method: "POST" });
  assert.equal(res.status, 405);
  assert.equal(res.headers.allow, "GET, HEAD");
});

test("full media responses retain the correct length and restrictive CSP", async () => {
  const res = await get("/docs/media/sample.mp4");
  assert.equal(res.status, 200);
  assert.equal(res.body, "0123456789");
  assert.equal(res.headers["content-length"], "10");
  assert.equal(res.headers["content-type"], "video/mp4");
  assert.match(res.headers["content-security-policy"], /script-src 'none'/);
});

test("bounded media ranges preserve video seeking", async () => {
  const res = await get("/docs/media/sample.mp4", { headers: { Range: "bytes=2-5" } });
  assert.equal(res.status, 206);
  assert.equal(res.body, "2345");
  assert.equal(res.headers["content-range"], "bytes 2-5/10");
  assert.equal(res.headers["content-length"], "4");
});

test("open-ended and HEAD range requests work without leaking a HEAD body", async () => {
  assert.equal(
    (await get("/docs/media/sample.mp4", { headers: { Range: "bytes=7-" } })).body,
    "789"
  );
  const res = await get("/docs/media/sample.mp4", {
    method: "HEAD",
    headers: { Range: "bytes=2-5" }
  });
  assert.equal(res.status, 206);
  assert.equal(res.body, "");
  assert.equal(res.headers["content-length"], "4");
});

test("malformed, oversized and reversed ranges are rejected", async () => {
  for (const range of [
    "bytes=10-",
    "bytes=5-2",
    "bytes=0-999",
    "bytes=9007199254740992-",
    "bytes=0-1,2-3",
    "invalid"
  ]) {
    const res = await get("/docs/media/sample.mp4", { headers: { Range: range } });
    assert.equal(res.status, 416);
    assert.equal(res.headers["content-range"], "bytes */10");
  }
});

test("empty assets and Markdown HEAD requests complete normally", async () => {
  const empty = await get("/docs/media/empty.vtt");
  assert.equal(empty.status, 200);
  assert.equal(empty.headers["content-length"], "0");
  const head = await get("/README.md", { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(head.body, "");
});

for (const [path, original] of [
  ["/docs/race.md", "original markdown"],
  ["/docs/media/race.mp4", "original media"]
]) {
  test(`pathname replacement after metadata cannot redirect reads: ${path}`, async () => {
    const originalFstat = fs.fstatSync;
    let replaced = false;
    fs.fstatSync = (descriptor) => {
      const stat = originalFstat(descriptor);
      if (!replaced) {
        replaced = true;
        const file = join(fixture, path.slice(1));
        fs.renameSync(file, file + ".original");
        fs.writeFileSync(file, "replacement content");
      }
      return stat;
    };
    syncBuiltinESMExports();
    try {
      const res = await get(path);
      assert.equal(res.status, 200);
      assert.ok(replaced);
      if (path.endsWith(".md")) assert.equal(renderedInputs.at(-1), original);
      else assert.equal(res.body, original);
    } finally {
      fs.fstatSync = originalFstat;
      syncBuiltinESMExports();
    }
  });
}
