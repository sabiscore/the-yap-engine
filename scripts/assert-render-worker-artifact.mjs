import { access, mkdir, readdir, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

// This script is invoked both from the repository root (Render build command)
// and from apps/swarmx-api (the package-level build script). Anchor all paths
// to this file so the assertion is independent of process.cwd().
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const canonical = resolve(root, "apps/swarmx-api/dist/apps/swarmx-api/src/workers/start-worker.js");

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

async function findWorker(dir, depth = 0) {
  if (depth > 6) return null;
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return null; }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isFile() && entry.name === "start-worker.js") return path;
    if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== ".git") {
      const found = await findWorker(path, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

if (!(await exists(canonical))) {
  const emitted = await findWorker(resolve(root, "apps/swarmx-api/dist"));
  if (!emitted) {
    throw new Error(`Render worker artifact missing after build: ${canonical}`);
  }
  await mkdir(resolve(root, "apps/swarmx-api/dist/apps/swarmx-api/src/workers"), { recursive: true });
  await copyFile(emitted, canonical);
  console.log(`Normalized Render worker artifact: ${emitted} -> ${canonical}`);
}

await access(canonical);
console.log(`Render worker artifact verified: ${canonical}`);
