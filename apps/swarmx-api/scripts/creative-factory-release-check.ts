/**
 * Creative Factory source-aware release invariants.
 *
 * This script checks cross-package safety properties that are too broad for a
 * single unit test but too important to leave as documentation-only promises.
 * It is intentionally offline: no Docker, Redis, Ollama, or network required.
 */

import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = new URL("../../../", import.meta.url);
const PUBLIC_VIDEO_TOKEN_ENV = `NEXT_PUBLIC_${"SWARMX_VIDEO_API_TOKEN"}`;

async function readRepoFile(path: string): Promise<string> {
  return readFile(new URL(path, repoRoot), "utf8");
}

async function listFilesRecursive(relativeDir: string): Promise<string[]> {
  const root = fileURLToPath(new URL(relativeDir, repoRoot));
  const results: string[] = [];
  async function walk(absDir: string, relPrefix: string): Promise<void> {
    const entries = await readdir(absDir, { withFileTypes: true });
    await Promise.all(entries.map(async (entry) => {
      const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      const absPath = join(absDir, entry.name);
      if (entry.isDirectory()) {
        await walk(absPath, relPath);
        return;
      }
      if (entry.isFile()) results.push(`${relativeDir.replace(/\/$/, "")}/${relPath}`);
    }));
  }
  await walk(root, "");
  return results.sort();
}

function assertIncludes(source: string, needle: string, message: string): void {
  assert.ok(source.includes(needle), message);
}

const workflowSource = await readRepoFile("apps/swarmx-api/src/services/creative-factory-workflow.ts");
for (const stage of [
  "INTAKE_VALIDATE",
  "BRAND_AUDIENCE_RESOLVE",
  "EPISODE_SCRIPT_VALIDATE",
  "HUMAN_REVIEW",
  "PLATFORM_PACKAGE",
  "PUBLISH_OR_EXPORT",
  "ANALYTICS_INGEST",
  "LEARNING_UPDATE",
]) {
  assertIncludes(workflowSource, `"${stage}"`, `Creative Factory workflow must include ${stage}`);
}
assertIncludes(workflowSource, "hydrateWorkflowRunsFromDisk", "workflow runs must hydrate from durable state");
assertIncludes(workflowSource, "idempotencyKey", "workflow runs must carry an idempotency key");
assertIncludes(workflowSource, "humanApprovalRequired", "workflow stages must model human approval gates");
assertIncludes(workflowSource, "PREREQUISITE_INCOMPLETE", "workflow checkpointing must block incomplete prerequisites");

const factoryRouteSource = await readRepoFile("apps/swarmx-api/src/routes/creative-factory.ts");
assertIncludes(factoryRouteSource, "/runs/:id/checkpoints", "Creative Factory routes must expose resumable checkpoints");
assertIncludes(factoryRouteSource, "requireVideoWriteAuth", "Creative Factory write routes must require video write auth");
assertIncludes(factoryRouteSource, "/analytics/performance", "Creative Factory routes must expose observed analytics ingestion");
assertIncludes(factoryRouteSource, "/creative-dna", "Creative Factory routes must expose CreativeDNA records");
assertIncludes(factoryRouteSource, "/concept-tournaments", "Creative Factory routes must expose concept tournaments");
assertIncludes(factoryRouteSource, "/variants", "Creative Factory routes must expose variant lineage");
assertIncludes(factoryRouteSource, "/agents", "Creative Factory routes must expose typed agent specs");

const factoryRegistrySource = await readRepoFile("apps/swarmx-api/src/services/creative-factory-registry.ts");
assertIncludes(factoryRegistrySource, "CreativeDNA", "Creative Factory registry must persist typed CreativeDNA");
assertIncludes(factoryRegistrySource, "ConceptTournament", "Creative Factory registry must persist typed concept tournaments");
assertIncludes(factoryRegistrySource, "VariantRecord", "Creative Factory registry must persist typed variant lineage");
assertIncludes(factoryRegistrySource, "CreativeAgentSpec", "Creative Factory registry must persist typed agent specs");
assertIncludes(factoryRegistrySource, "concept-tournament-agent", "Creative Factory registry must seed the tournament agent");
assertIncludes(factoryRegistrySource, "quality-council-agent", "Creative Factory registry must seed the quality council agent");

const certificationSource = await readRepoFile("apps/swarmx-api/src/services/creative-factory-certification.ts");
assertIncludes(certificationSource, "READY_TO_POST", "READY_TO_POST certification must be executable");
assertIncludes(certificationSource, "Stub media cannot be READY_TO_POST", "stub media must never certify as ready");
assertIncludes(certificationSource, "rights state", "asset rights must participate in READY_TO_POST certification");

const analyticsSource = await readRepoFile("apps/swarmx-api/src/services/creative-factory-analytics.ts");
assertIncludes(analyticsSource, "PerformanceSnapshot", "analytics storage must use observed PerformanceSnapshot records");
assert.equal(
  analyticsSource.includes("viralityAtPublish"),
  false,
  "observed analytics storage must not persist predicted virality as observed performance",
);

const localStoreSource = await readRepoFile("apps/swarmx-api/src/services/local-state-store.ts");
assertIncludes(localStoreSource, "appendFileSync", "local state store must keep an append-only lifecycle journal");
assertIncludes(localStoreSource, "renameSync", "local state store must write atomic snapshots through rename");
assertIncludes(localStoreSource, "schemaVersion", "local state store must version persisted snapshots");
assertIncludes(localStoreSource, '"creative-dna"', "local state store must allow CreativeDNA records");
assertIncludes(localStoreSource, '"concept-tournaments"', "local state store must allow concept tournament records");
assertIncludes(localStoreSource, '"variant-records"', "local state store must allow variant lineage records");
assertIncludes(localStoreSource, '"creative-agent-specs"', "local state store must allow agent spec records");
assertIncludes(localStoreSource, '"creative-blackboard"', "local state store must allow blackboard records");

const rendererSource = await readRepoFile("apps/swarmx-api/src/services/ffmpeg-video-renderer.ts");
assertIncludes(rendererSource, "quality-report.json", "production package must emit directive quality report");
assertIncludes(rendererSource, "rights-manifest.json", "production package must emit directive rights manifest");
assertIncludes(rendererSource, "platform-manifest.json", "production package must emit directive platform manifest");
assertIncludes(rendererSource, "voice-lineage.json", "production package must emit directive voice lineage");
assertIncludes(rendererSource, "template-lineage.json", "production package must emit directive template lineage");
assertIncludes(rendererSource, "thumbnail.jpg", "production package must emit a thumbnail");
assertIncludes(rendererSource, "ffmpeg_cinematic_explainer", "cinematic requests must select the cinematic template tier");

const serverSource = await readRepoFile("apps/swarmx-api/src/server.ts");
assertIncludes(serverSource, "hydrateVideoQueueFromDisk", "API startup must hydrate video jobs");
assertIncludes(serverSource, "hydrateSeriesRegistryFromDisk", "API startup must hydrate series jobs");
assertIncludes(serverSource, "hydrateWorkflowRunsFromDisk", "API startup must hydrate workflow runs");
assertIncludes(serverSource, "creativeFactoryRoutes", "API startup must register Creative Factory routes");
assertIncludes(serverSource, "SWARMX_VIDEO_API_TOKEN is not set", "production write-token fail-closed warning must remain");

const preproducerSource = await readRepoFile("apps/swarmx-api/src/services/video-episode-preproducer.ts");
assertIncludes(
  preproducerSource,
  'status: qualityGateResult.passed ? "complete" : "failed"',
  "mandatory quality-gate failure must not mark pre-production complete",
);
assertIncludes(preproducerSource, "QUALITY_GATE_FAILED", "failed mandatory quality gates must expose a stable code");

const seriesTypesSource = await readRepoFile("packages/swarmx-types/src/series-types.ts");
assertIncludes(seriesTypesSource, "EpisodePreProductionErrorCode", "episode pre-production failures must be typed");
assertIncludes(seriesTypesSource, "QUALITY_GATE_FAILED", "quality-gate failures must have a canonical error code");

const dashboardProxySource = await readRepoFile("apps/swarmx-dashboard/src/app/api/[...path]/route.ts");
assertIncludes(dashboardProxySource, 'headers.delete("authorization")', "proxy must strip browser Authorization headers");
assertIncludes(dashboardProxySource, 'headers.delete("x-video-api-key")', "proxy must strip browser video API-key headers");
assertIncludes(dashboardProxySource, "process.env.SWARMX_VIDEO_API_TOKEN", "proxy must use server-only video token");
assert.equal(
  dashboardProxySource.includes(PUBLIC_VIDEO_TOKEN_ENV),
  false,
  "proxy must never read a public video write-token env var",
);

const nextConfigSource = await readRepoFile("apps/swarmx-dashboard/next.config.ts");
assert.equal(nextConfigSource.includes('source: "/api/:path*"'), false, "Next rewrites must not own /api/*");
assertIncludes(nextConfigSource, 'source: "/ws/:path*"', "WebSocket rewrite must remain separate from API proxy");

const composeSource = await readRepoFile("docker-compose.yml");
assertIncludes(composeSource, "dockerfile: apps/swarmx-api/Dockerfile", "API Compose build must use repo-root Docker context");
for (const requiredDefault of [
  'SWARMX_HOST_PROFILE: "${SWARMX_HOST_PROFILE:-constrained_cpu_8gb}"',
  'OLLAMA_MAX_LOADED_MODELS: "${OLLAMA_MAX_LOADED_MODELS:-1}"',
  'OLLAMA_NUM_PARALLEL: "${OLLAMA_NUM_PARALLEL:-1}"',
  'OLLAMA_KEEP_ALIVE: "${OLLAMA_KEEP_ALIVE:-0}"',
  'OLLAMA_FLASH_ATTENTION: "${OLLAMA_FLASH_ATTENTION:-0}"',
  'OLLAMA_KV_CACHE_TYPE: "${OLLAMA_KV_CACHE_TYPE:-f16}"',
]) {
  assertIncludes(composeSource, requiredDefault, `docker-compose.yml missing ${requiredDefault}`);
}

const apiDockerfileSource = await readRepoFile("apps/swarmx-api/Dockerfile");
const dashboardDockerfileSource = await readRepoFile("apps/swarmx-dashboard/Dockerfile");
assertIncludes(apiDockerfileSource, "ARG PNPM_VERSION=11.9.0", "API Dockerfile must pin pnpm to repository packageManager");
assertIncludes(dashboardDockerfileSource, "ARG PNPM_VERSION=11.9.0", "Dashboard Dockerfile must pin pnpm to repository packageManager");
assertIncludes(dashboardDockerfileSource, "COPY pnpm-lock.yaml", "Dashboard Dockerfile must install from the workspace lockfile");
assert.equal(
  dashboardDockerfileSource.includes("next.config.override.js"),
  false,
  "Dashboard Dockerfile must not synthesize a next.config override during image build",
);

const dashboardNextConfigSource = await readRepoFile("apps/swarmx-dashboard/next.config.ts");
assertIncludes(dashboardNextConfigSource, 'output: "standalone"', "Dashboard standalone output must be explicit in next.config.ts");

for (const docsFile of [
  "docs/CREATIVE_FACTORY_AUDIT_LEDGER.md",
  "docs/CREATIVE_FACTORY_RELEASE_STATUS.md",
  "docs/CONFIG_REFERENCE.md",
  "docs/VIDEO-GENERATION.md",
]) {
  const docsSource = await readRepoFile(docsFile);
  assert.equal(
    docsSource.includes(PUBLIC_VIDEO_TOKEN_ENV),
    false,
    `${docsFile} must not document browser-exposed video write tokens`,
  );
}

const dashboardSourceFiles = await listFilesRecursive("apps/swarmx-dashboard/src");
for (const file of dashboardSourceFiles.filter((path) => /\.(ts|tsx)$/.test(path))) {
  const source = await readRepoFile(file);
  assert.equal(
    source.includes(PUBLIC_VIDEO_TOKEN_ENV),
    false,
    `${file} must not read a public video write-token env var`,
  );
}

console.log("Creative Factory release invariants passed.");
