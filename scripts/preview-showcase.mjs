import { createServer } from "node:http";
import { closeSync, createReadStream, fstatSync, openSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Localhost-only documentation preview. Optional isolated tooling dependency: marked.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mime = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".mp4": "video/mp4",
  ".vtt": "text/vtt",
  ".html": "text/html; charset=utf-8"
};
const css = `body{margin:0;background:#f5f2e9;color:#14232d;font:16px/1.7 system-ui,sans-serif}
main{max-width:1040px;margin:auto;padding:38px 26px}h1,h2{font-family:Georgia,serif;line-height:1.2}
h1{font-size:52px}h2{font-size:32px;margin-top:42px}h3{font-size:21px}a{color:#245d78}
img{max-width:100%;height:auto;border-radius:10px}table{border-collapse:collapse;width:100%}
td,th{padding:12px;text-align:left;border:1px solid #bcc5c9}th{background:#e7eff0}
code{font:14px ui-monospace,monospace}pre{background:#14232d;color:#f5f2e9;padding:20px;overflow:auto}
blockquote{margin:20px 0;padding:12px 20px;border-left:3px solid #ac9470;background:#e7eff0}
summary{cursor:pointer;padding:12px;background:#e7eff0}nav{font-size:14px}`;
// Only the generated ID is normalized here: this is not an HTML sanitizer.
// The HTML body intentionally renders trusted repository documentation under a no-script CSP.
export function addHeadingIds(html) {
  const headingIds = new Map();
  return html.replace(/<(h[1-6])>([\s\S]*?)<\/\1>/g, (_, tag, title) => {
    const slug = title
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .trim()
      .replace(/\s+/g, "-");
    const count = headingIds.get(slug) || 0;
    headingIds.set(slug, count + 1);
    return `<${tag} id="${slug}${count ? "-" + count : ""}">${title}</${tag}>`;
  });
}

export function createShowcaseServer({ rootDirectory = root, renderMarkdown }) {
  const previewRoot = resolve(rootDirectory);
  return createServer((req, res) => {
    let descriptor;
    try {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; img-src 'self'; style-src 'unsafe-inline'; script-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"
      );
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405, { Allow: "GET, HEAD" }).end();
        return;
      }
      const url = new URL(req.url, "http://127.0.0.1");
      const pathname = decodeURIComponent(url.pathname);
      const allowed =
        pathname === "/" ||
        pathname === "/README.md" ||
        pathname === "/SECURITY.md" ||
        pathname.startsWith("/docs/") ||
        pathname.startsWith("/screenshots/showcase/");
      if (!allowed) {
        res.writeHead(404).end();
        return;
      }
      const file = resolve(previewRoot, "." + (pathname === "/" ? "/README.md" : pathname));
      if (!file.startsWith(previewRoot + sep)) {
        res.writeHead(403).end();
        return;
      }
      // Open once. Metadata, Markdown reads and media streams use this same descriptor;
      // replacing the pathname after opening cannot redirect the subsequent read.
      descriptor = openSync(file, "r");
      const stat = fstatSync(descriptor);
      if (!stat.isFile()) {
        res.writeHead(404).end();
        return;
      }
      if (extname(file) === ".md") {
        const html = addHeadingIds(renderMarkdown(readFileSync(descriptor, "utf8")));
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8"
        });
        res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
        <title>WorkflowHQ README preview</title><style>${css}</style><main>
        <nav>LOCAL PREVIEW — <a href="/README.md">README</a> · <a href="/docs/media/preview.html">Video player / gallery</a></nav>
        ${html}</main></html>`);
        return;
      }
      res.setHeader("Content-Type", mime[extname(file)] || "application/octet-stream");
      res.setHeader("Accept-Ranges", "bytes");
      const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
      const start = range ? Number(range[1]) : 0;
      const end = range && range[2] ? Number(range[2]) : stat.size - 1;
      if (
        req.headers.range &&
        (!range ||
          !Number.isSafeInteger(start) ||
          !Number.isSafeInteger(end) ||
          start > end ||
          end >= stat.size)
      ) {
        res.writeHead(416, { "Content-Range": `bytes */${stat.size}` }).end();
        return;
      }
      res.statusCode = range ? 206 : 200;
      if (range) res.setHeader("Content-Range", `bytes ${start}-${end}/${stat.size}`);
      res.setHeader("Content-Length", end - start + 1);
      if (req.method === "HEAD" || stat.size === 0) {
        res.end();
        return;
      }
      const stream = createReadStream(file, { fd: descriptor, autoClose: true, start, end });
      descriptor = undefined; // The stream now owns and closes this descriptor.
      stream.on("error", () => res.destroy());
      res.on("close", () => stream.destroy());
      stream.pipe(res);
    } catch {
      if (res.headersSent) res.destroy();
      else res.writeHead(404).end("Not found");
    } finally {
      if (descriptor !== undefined) closeSync(descriptor);
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const require = createRequire(import.meta.url);
  const { marked } = await import(pathToFileURL(require.resolve("marked")).href);
  createShowcaseServer({ renderMarkdown: (markdown) => marked.parse(markdown) }).listen(
    5198,
    "127.0.0.1",
    () => {
      console.log("README preview: http://127.0.0.1:5198/README.md");
    }
  );
}
