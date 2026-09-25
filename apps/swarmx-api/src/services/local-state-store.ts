import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadEnv } from "../lib/env.js";
import { log } from "../lib/logger.js";

export type DurableCollection =
  | "series"
  | "video-jobs"
  | "creative-workflow-runs"
  | "workspaces"
  | "projects"
  | "brand-kits"
  | "audience-personas"
  | "video-blueprints"
  | "platform-capabilities"
  | "assets"
  | "render-recipes"
  | "subtitle-tracks"
  | "quality-reports"
  | "compliance-reports"
  | "publish-packages"
  | "performance-snapshots"
  | "experiments"
  | "learning-records"
  | "creative-dna"
  | "concept-tournaments"
  | "variant-records"
  | "creative-agent-specs"
  | "creative-blackboard"
  | "campaigns"
  | "publish-tasks";

interface SnapshotEnvelope<T> {
  schemaVersion: 1;
  collection: DurableCollection;
  savedAt: string;
  records: T[];
}

interface EventEnvelope<T> {
  schemaVersion: 1;
  collection: DurableCollection;
  event: string;
  recordId: string;
  savedAt: string;
  record: T;
}

function stateDir(): string {
  return join(loadEnv().SWARMX_HOME, "state");
}

function snapshotPath(collection: DurableCollection): string {
  return join(stateDir(), `${collection}.snapshot.json`);
}

function journalPath(collection: DurableCollection): string {
  return join(stateDir(), `${collection}.events.jsonl`);
}

function ensureParent(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

export function writeSnapshot<T>(collection: DurableCollection, records: T[]): void {
  const path = snapshotPath(collection);
  const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  const envelope: SnapshotEnvelope<T> = {
    schemaVersion: 1,
    collection,
    savedAt: new Date().toISOString(),
    records,
  };
  try {
    ensureParent(path);
    writeFileSync(tempPath, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
    renameSync(tempPath, path);
  } catch (err) {
    log.error(
      { collection, err: err instanceof Error ? err.message : String(err) },
      "durable-state: snapshot write failed",
    );
  }
}

export function appendStateEvent<T extends { id: string }>(
  collection: DurableCollection,
  event: string,
  record: T,
): void {
  const path = journalPath(collection);
  const envelope: EventEnvelope<T> = {
    schemaVersion: 1,
    collection,
    event,
    recordId: record.id,
    savedAt: new Date().toISOString(),
    record,
  };
  try {
    ensureParent(path);
    appendFileSync(path, `${JSON.stringify(envelope)}\n`, "utf8");
  } catch (err) {
    log.error(
      { collection, event, recordId: record.id, err: err instanceof Error ? err.message : String(err) },
      "durable-state: event append failed",
    );
  }
}

export function readSnapshot<T>(collection: DurableCollection): T[] {
  const path = snapshotPath(collection);
  if (!existsSync(path)) return [];
  try {
    const raw = readFileSync(path, "utf8");
    const envelope = JSON.parse(raw) as Partial<SnapshotEnvelope<unknown>>;
    if (
      envelope.schemaVersion !== 1 ||
      envelope.collection !== collection ||
      !Array.isArray(envelope.records)
    ) {
      log.warn({ collection, path }, "durable-state: ignoring invalid snapshot envelope");
      return [];
    }
    return envelope.records as T[];
  } catch (err) {
    log.error(
      { collection, path, err: err instanceof Error ? err.message : String(err) },
      "durable-state: snapshot read failed",
    );
    return [];
  }
}
