import { executeTikTokDirectPostWithAccessToken } from "./tiktok-protocol.js";
import { getTikTokAccessToken, getTikTokAccount, setTikTokAccountStatus } from "./tiktok-accounts.js";
import { loadEnv } from "../lib/env.js";

export async function verifyTikTokControlledAccount(input: {
  accountId: string;
  outputPath: string;
  prompt: string;
  durationSeconds?: number;
}): Promise<{ accountId: string; status: "controlled_verified"; publishId: string }> {
  if (loadEnv().SWARMX_TIKTOK_API_APPROVED !== "1") {
    throw new Error("TikTok API approval gate is disabled");
  }
  const account = await getTikTokAccount(input.accountId);
  if (!account) throw new Error("TikTok account not found");
  if (account.status !== "active") {
    throw new Error("Controlled verification requires an active TikTok account");
  }

  const { accessToken } = await getTikTokAccessToken(input.accountId);
  const result = await executeTikTokDirectPostWithAccessToken({
    token: accessToken,
    prompt: input.prompt,
    outputPath: input.outputPath,
    durationSeconds: input.durationSeconds,
    privacyLevel: "SELF_ONLY",
    requireSelfOnly: true,
  });

  if (result.status !== "published") {
    throw new Error(result.failureReason ?? "Controlled TikTok test did not reach published state");
  }

  await setTikTokAccountStatus(input.accountId, "controlled_verified");
  return { accountId: input.accountId, status: "controlled_verified", publishId: result.publishId };
}
