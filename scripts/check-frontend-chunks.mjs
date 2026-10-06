import { readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dist = resolve(dirname(fileURLToPath(import.meta.url)), "../frontend/dist");
const manifest = JSON.parse(readFileSync(resolve(dist, ".vite/manifest.json"), "utf8"));
const entry = Object.entries(manifest).find(([, chunk]) => chunk.isEntry);
if (!entry) throw new Error("Build manifest contains no application entry");
const startup = new Set();
function visit(key) {
  if (startup.has(key)) return;
  const chunk = manifest[key];
  if (!chunk) throw new Error("Missing manifest import: " + key);
  startup.add(key);
  for (const dependency of chunk.imports || []) visit(dependency);
}
visit(entry[0]);
const size = (chunk) => statSync(resolve(dist, chunk.file)).size;
const bytes = [...startup].reduce((total, key) => total + size(manifest[key]), 0);
const failures = [];
for (const [key, chunk] of Object.entries(manifest)) {
  if (chunk.file.endsWith(".js") && size(chunk) > 500_000) failures.push(key + ": over 500 kB");
  if (key.startsWith("src/pages/") && startup.has(key))
    failures.push(key + ": eagerly loaded page");
}
for (const key of [
  "src/pages/Landing.tsx",
  "src/pages/WorkspaceEngineering.tsx",
  "src/pages/GitHubIntegration.tsx",
  "src/pages/ProjectAiConversations.tsx",
  "src/components/TaskModal.tsx",
  "src/components/AiPlanModal.tsx",
  "src/components/RibbonGlow.tsx"
]) {
  if (!manifest[key]?.isDynamicEntry || startup.has(key)) {
    failures.push(key + ": missing on-demand import boundary");
  }
}
// Budget includes the entry and every static JS dependency, not just the entry's size.
if (bytes > 320_000) failures.push("Startup JS exceeds 320 kB: " + bytes);
if (failures.length) {
  throw new Error("FRONTEND_CHUNK_CHECK_FAILED\n" + failures.join("\n"));
}
console.log(
  "FRONTEND_CHUNK_CHECK_OK",
  JSON.stringify({
    entryBytes: size(entry[1]),
    startupJsBytes: bytes,
    startupChunks: startup.size,
    deferredPages: Object.keys(manifest).filter((key) => key.startsWith("src/pages/")).length
  })
);
