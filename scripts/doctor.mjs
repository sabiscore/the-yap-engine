import { execFileSync } from "node:child_process";

const checks = [
  ["node", ["--version"], /^v22\./, "Node 22"],
  ["pnpm", ["--version"], /^12\.6\./, "pnpm 12.6"],
  ["docker", ["compose", "version"], /Docker Compose v2\./, "Docker Compose v2"],
  ["ffmpeg", ["-version"], /ffmpeg version/i, "FFmpeg"],
  ["ffprobe", ["-version"], /ffprobe version/i, "FFprobe"],
];

let failed = 0;
for (const [command, args, pattern, label] of checks) {
  try {
    const output = execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    if (!pattern.test(output)) throw new Error("version mismatch");
    console.log("[doctor] PASS", label, output.split("\n")[0]);
  } catch {
    failed += 1;
    console.error("[doctor] FAIL", label);
  }
}

if (process.platform === "win32") {
  console.log("[doctor] INFO Windows host: validate WSL2 memory ceiling with docs/WINDOWS-WSL-PROFILES.md");
}

if (failed) {
  console.error("[doctor] " + failed + " prerequisite check(s) failed");
  process.exit(1);
}
console.log("[doctor] prerequisites ready");
