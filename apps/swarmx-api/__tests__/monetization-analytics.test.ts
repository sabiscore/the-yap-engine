import { describe, expect, it } from "vitest";
import { summarizeMonetization } from "../src/services/monetization-analytics.js";
import type { MonetizationObservation } from "@swarmx/types/video-types";

describe("empirical monetization accounting", () => {
  it("computes margin only from observed revenue and recorded costs", () => {
    const observation = {
      id: "obs-1", userId: "user-1", packageId: "pkg-1", platform: "tiktok" as const,
      observedAt: new Date().toISOString(), currency: "USD",
      platformRewardsCents: 1250, viewCount: 1000, qualifiedViews: 700, watchTimeSeconds: 4200, completionRate: 0.7, shares: 40, comments: 15,
      affiliateClicks: 100, affiliateConversions: 5, affiliateRevenueCents: 3000,
      landingPageVisits: 80, funnelSessions: 75, checkoutStarts: 10, ownedProductConversions: 2, ownedProductRevenueCents: 4000,
      sponsorRevenueCents: 0, llmCostCents: 300, ttsCostCents: 100, renderCostCents: 500, storageCostCents: 25, egressCostCents: 25,
      source: "test", generationCostCents: 400, distributionCostCents: 25, revenueCents: 8250, contributionMarginCents: 7300, updatedAt: new Date().toISOString(),
    } satisfies MonetizationObservation;
    const summary = summarizeMonetization([observation]);
    expect(summary.revenueCents).toBe(8250);
    expect(summary.costCents).toBe(950);
    expect(summary.contributionMarginCents).toBe(7300);
    expect(summary.affiliateConversionRate).toBeCloseTo(0.05);
    expect(summary.ownedProductConversionRate).toBeCloseTo(0.2);
  });
});
