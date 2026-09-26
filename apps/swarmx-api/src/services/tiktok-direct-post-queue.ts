import { createHash } from "node:crypto";
import { Queue, QueueEvents, Worker, type JobsOptions } from "bullmq";
import { loadEnv } from "../lib/env.js";
import { executeTikTokDirectPostWithAccessToken, type TikTokDirectPostInput, type TikTokDirectPostOutcome } from "./tiktok-protocol.js";

export interface TikTokDirectPostJob extends Omit<TikTokDirectPostInput, "token"> {
  accountId: string;
}

interface Lane {
  queue: Queue<TikTokDirectPostJob>;
  events: QueueEvents;
  worker: Worker<TikTokDirectPostJob, TikTokDirectPostOutcome>;
}

const lanes = new Map<string, Lane>();
const MAX_LANES = 16;

function queueName(accountId: string): string {
  const digest = createHash("sha256").update(accountId).digest("hex").slice(0, 24);
  return `swarmx-tiktok-direct-${digest}`;
}

function redisConnection() {
  return { url: loadEnv().REDIS_URL };
}

async function createLane(accountId: string): Promise<Lane> {
  const existing = lanes.get(accountId);
  if (existing) return existing;
  if (lanes.size >= MAX_LANES) {
    throw new Error("TikTok account queue capacity reached; close idle lanes before adding another account");
  }

  const name = queueName(accountId);
  const queue = new Queue<TikTokDirectPostJob>(name, {
    connection: redisConnection(),
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 50 },
    },
  });
  const events = new QueueEvents(name, { connection: redisConnection() });
  const worker = new Worker<TikTokDirectPostJob, TikTokDirectPostOutcome>(
    name,
    async (job) => {
      const { accountId: _accountId, ...input } = job.data;
      return executeTikTokDirectPostWithAccessToken(input);
    },
    {
      connection: redisConnection(),
      concurrency: 1,
      limiter: { max: 6, duration: 60_000 },
    },
  );

  worker.on("failed", (job, error) => {
    if (job) {
      void queue.add(
        "audit",
        { ...job.data },
        { removeOnComplete: true, removeOnFail: true } satisfies JobsOptions,
      ).catch(() => {});
    }
    loadEnv();
  });

  lanes.set(accountId, { queue, events, worker });
  return lanes.get(accountId)!;
}

export async function enqueueTikTokDirectPost(
  input: TikTokDirectPostJob,
  timeoutMs = 90_000,
): Promise<TikTokDirectPostOutcome> {
  const lane = await createLane(input.accountId);
  await lane.events.waitUntilReady();
  const job = await lane.queue.add("direct-post", input);
  return job.waitUntilFinished(lane.events, timeoutMs);
}

export async function closeTikTokDirectPostQueues(): Promise<void> {
  const active = [...lanes.values()];
  lanes.clear();
  await Promise.all(active.map(async ({ queue, events, worker }) => {
    await Promise.allSettled([worker.close(), events.close(), queue.close()]);
  }));
}
