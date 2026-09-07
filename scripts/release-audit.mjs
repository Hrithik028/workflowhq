import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const safeRoot = root.replaceAll("\\", "/");
const git = (...args) =>
  execFileSync("git", ["-c", `safe.directory=${safeRoot}`, ...args], {
    cwd: root,
    encoding: "utf8"
  });

const files = git("ls-files", "--cached", "--others", "--exclude-standard", "-z")
  .split("\0")
  .filter(Boolean)
  .filter((file) => !file.includes("node_modules/") && !file.startsWith("frontend/dist/"));

const allowedEnvironmentExamples = new Set([
  "backend/.env.example",
  "frontend/.env.demo",
  "frontend/.env.example"
]);
const blockedPaths = files.filter((file) => {
  const normalized = file.replaceAll("\\", "/");
  const basename = normalized.split("/").at(-1) || "";
  if (basename.startsWith(".env") && !allowedEnvironmentExamples.has(normalized)) return true;
  return [
    ".pem",
    ".key",
    ".p12",
    ".pfx",
    ".db",
    ".sqlite",
    ".sqlite3",
    ".dump",
    ".backup",
    ".log"
  ].includes(extname(basename).toLowerCase());
});

const oversizedFiles = files.filter((file) => statSync(resolve(root, file)).size > 5 * 1024 * 1024);
const binaryExtensions = new Set([
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".png",
  ".webp",
  ".woff",
  ".woff2"
]);
const secretPatterns = [
  { label: "private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  {
    label: "GitHub token",
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/
  },
  { label: "OpenAI-style secret", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { label: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { label: "Slack token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/ }
];
const secretFindings = [];

for (const file of files) {
  if (binaryExtensions.has(extname(file).toLowerCase())) continue;
  const content = readFileSync(resolve(root, file), "utf8");
  for (const { label, pattern } of secretPatterns) {
    if (pattern.test(content)) secretFindings.push(`${file}: recognizable ${label}`);
  }
}

const failures = [
  ...blockedPaths.map((file) => `${file}: blocked private/runtime file type`),
  ...oversizedFiles.map((file) => `${file}: file exceeds 5 MiB`),
  ...secretFindings
];

if (failures.length) {
  console.error("RELEASE_AUDIT_FAILED");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`RELEASE_AUDIT_OK ${files.length} source files inspected`);
}
