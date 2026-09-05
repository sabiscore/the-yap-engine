/**
 * apps/swarmx-api/src/services/webhook-notifier.ts
 *
 * Free operator notifications (v5 finalization directive — ADR-8).
 *
 * Fires a Discord and/or Slack incoming-webhook message when a video job
 * finishes (success) or terminally fails (no retry scheduled). Both
 * destinations are optional and independent — set SWARMX_DISCORD_WEBHOOK_URL,
 * SWARMX_SLACK_WEBHOOK_URL, both, or neither. Neither set means this module
 * is a complete no-op: no network call, no error, no log noise.
 *
 * Zero new dependencies — uses the native `fetch()` already available in
 * Node 22. Never throws: a broken or unreachable webhook must never take
 * down a render job, so every failure is caught and logged at `warn`.
 * Fire-and-forget by design — callers do not (and should not) await the
 * network round-trip on the render's critical path.
 */
import { loadEnv } from "../lib/env.js";
import { log } from "../lib/logger.js";
import type { VideoJob, VideoJobError, VideoOutputMetadata } from "../types/video.js";

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** exponent).toFixed(1)} ${units[exponent]}`;
}

async function postJson(url: string, body: unknown): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      log.warn(
        { status: response.status, statusText: response.statusText },
        "[webhook-notifier] webhook responded with a non-2xx status",
      );
    }
  } finally {
    clearTimeout(timeout);
  }
}

function discordPayload(title: string, description: string, color: number, fields: Array<{ name: string; value: string }>) {
  return {
    embeds: [
      {
        title,
        description,
        color,
        fields: fields.map((field) => ({ name: field.name, value: field.value, inline: true })),
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

function slackPayload(title: string, description: string, fields: Array<{ name: string; value: string }>) {
  return {
    text: `${title} — ${description}`,
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: `*${title}*\n${description}` } },
      {
        type: "section",
        fields: fields.map((field) => ({ type: "mrkdwn", text: `*${field.name}:*\n${field.value}` })),
      },
    ],
  };
}

async function dispatch(
  title: string,
  description: string,
  color: number,
  fields: Array<{ name: string; value: string }>,
): Promise<void> {
  const env = loadEnv();
  const targets: Array<Promise<void>> = [];

  if (env.SWARMX_DISCORD_WEBHOOK_URL) {
    targets.push(postJson(env.SWARMX_DISCORD_WEBHOOK_URL, discordPayload(title, description, color, fields)));
  }
  if (env.SWARMX_SLACK_WEBHOOK_URL) {
    targets.push(postJson(env.SWARMX_SLACK_WEBHOOK_URL, slackPayload(title, description, fields)));
  }
  if (targets.length === 0) return;

  const results = await Promise.allSettled(targets);
  for (const result of results) {
    if (result.status === "rejected") {
      log.warn({ error: result.reason instanceof Error ? result.reason.message : String(result.reason) }, "[webhook-notifier] delivery failed");
    }
  }
}

/** Fire-and-forget: never awaited on the render critical path. */
export function notifyJobCompleted(job: VideoJob, output: VideoOutputMetadata): void {
  void dispatch(
    "🎬 Yap ready",
    `Job \`${job.id}\` finished rendering.`,
    0x22c55e, // green
    [
      { name: "Duration", value: `${output.durationSeconds.toFixed(1)}s` },
      { name: "Size", value: formatBytes(output.fileSizeBytes) },
      { name: "Platform", value: job.request.platform ?? "generic" },
      { name: "Style", value: job.request.style ?? "faceless_broll" },
      ...(job.preliminaryHookScore !== undefined
        ? [{ name: "Hook confidence", value: job.preliminaryHookScore.toFixed(2) }]
        : []),
      { name: "URL", value: output.publicUrl },
    ],
  ).catch((error: unknown) => {
    log.warn({ jobId: job.id, error: error instanceof Error ? error.message : String(error) }, "[webhook-notifier] notifyJobCompleted failed");
  });
}

/** Fire-and-forget: only call for TERMINAL failures (no retry scheduled) to avoid spamming on every transient retry. */
export function notifyJobFailed(job: VideoJob, error: VideoJobError): void {
  void dispatch(
    "⚠️ Yap failed",
    `Job \`${job.id}\` failed after ${job.retryCount} ${job.retryCount === 1 ? "retry" : "retries"}.`,
    0xef4444, // red
    [
      { name: "Code", value: error.code },
      { name: "Stage", value: error.stage ?? "unknown" },
      { name: "Platform", value: job.request.platform ?? "generic" },
      { name: "Message", value: error.message.slice(0, 200) },
    ],
  ).catch((dispatchError: unknown) => {
    log.warn(
      { jobId: job.id, error: dispatchError instanceof Error ? dispatchError.message : String(dispatchError) },
      "[webhook-notifier] notifyJobFailed failed",
    );
  });
}
