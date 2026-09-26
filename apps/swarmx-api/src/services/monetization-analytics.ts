import { randomUUID } from "node:crypto";
import type { MonetizationObservation, MonetizationSummary } from "@swarmx/types/video-types";
import { getNeonSql } from "../lib/neon-db.js";
import { loadEnv } from "../lib/env.js";
import { readSnapshot, writeSnapshot } from "./local-state-store.js";

const LOCAL_COLLECTION = "monetization-observations" as const;

function money(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 0;
}

function mapRow(row: Record<string, unknown>): MonetizationObservation {
  return {
    id: String(row.id), userId: String(row.user_id), packageId: String(row.package_id),
    platform: String(row.platform) as MonetizationObservation["platform"],
    observedAt: new Date(String(row.observed_at)).toISOString(),
    currency: String(row.currency),
    platformRewardsCents: money(row.platform_rewards_cents),
    affiliateClicks: money(row.affiliate_clicks),
    affiliateConversions: money(row.affiliate_conversions),
    affiliateRevenueCents: money(row.affiliate_revenue_cents),
    landingPageVisits: money(row.landing_page_visits),
    checkoutStarts: money(row.checkout_starts),
    ownedProductConversions: money(row.owned_product_conversions),
    ownedProductRevenueCents: money(row.owned_product_revenue_cents),
    sponsorRevenueCents: money(row.sponsor_revenue_cents),
    llmCostCents: money(row.llm_cost_cents),
    ttsCostCents: money(row.tts_cost_cents),
    renderCostCents: money(row.render_cost_cents),
    storageCostCents: money(row.storage_cost_cents),
    egressCostCents: money(row.egress_cost_cents),
    source: String(row.source),
    ...(row.attribution_window_days == null ? {} : { attributionWindowDays: money(row.attribution_window_days) }),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

export async function recordMonetizationObservation(
  input: Omit<MonetizationObservation, "id" | "updatedAt" | "observedAt"> & { observedAt?: string },
): Promise<MonetizationObservation> {
  const record: MonetizationObservation = {
    id: randomUUID(),
    observedAt: input.observedAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...input,
  };
  if (loadEnv().DATABASE_URL) {
    const sql = getNeonSql();
    const rows = await sql`
      INSERT INTO public.monetization_observations (
        id,user_id,package_id,platform,observed_at,currency,
        platform_rewards_cents,affiliate_clicks,affiliate_conversions,affiliate_revenue_cents,
        landing_page_visits,checkout_starts,owned_product_conversions,owned_product_revenue_cents,
        sponsor_revenue_cents,llm_cost_cents,tts_cost_cents,render_cost_cents,storage_cost_cents,egress_cost_cents,
        source,attribution_window_days,updated_at
      ) VALUES (
        ${record.id},${record.userId},${record.packageId},${record.platform},${record.observedAt},${record.currency},
        ${record.platformRewardsCents},${record.affiliateClicks},${record.affiliateConversions},${record.affiliateRevenueCents},
        ${record.landingPageVisits},${record.checkoutStarts},${record.ownedProductConversions},${record.ownedProductRevenueCents},
        ${record.sponsorRevenueCents},${record.llmCostCents},${record.ttsCostCents},${record.renderCostCents},${record.storageCostCents},${record.egressCostCents},
        ${record.source},${record.attributionWindowDays ?? null},now()
      ) RETURNING *
    `;
    return mapRow(rows[0] as Record<string, unknown>);
  }

  const existing = readSnapshot<MonetizationObservation>(LOCAL_COLLECTION);
  writeSnapshot(LOCAL_COLLECTION, [...existing, record]);
  return record;
}

export async function listMonetizationObservations(userId?: string): Promise<MonetizationObservation[]> {
  if (loadEnv().DATABASE_URL) {
    const sql = getNeonSql();
    const rows = userId
      ? await sql`SELECT * FROM public.monetization_observations WHERE user_id=${userId} ORDER BY observed_at DESC LIMIT 500`
      : await sql`SELECT * FROM public.monetization_observations ORDER BY observed_at DESC LIMIT 500`;
    return rows.map((row) => mapRow(row as Record<string, unknown>));
  }
  const rows = readSnapshot<MonetizationObservation>(LOCAL_COLLECTION);
  return rows.filter((row) => !userId || row.userId === userId).sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt));
}

export function summarizeMonetization(observations: MonetizationObservation[]): MonetizationSummary {
  const sum = (key: keyof MonetizationObservation) => observations.reduce((total,row)=>total + money(row[key]),0);
  const revenueCents = sum("platformRewardsCents") + sum("affiliateRevenueCents") + sum("ownedProductRevenueCents") + sum("sponsorRevenueCents");
  const costCents = sum("llmCostCents") + sum("ttsCostCents") + sum("renderCostCents") + sum("storageCostCents") + sum("egressCostCents");
  const affiliateClicks = sum("affiliateClicks");
  const affiliateConversions = sum("affiliateConversions");
  const checkoutStarts = sum("checkoutStarts");
  const ownedProductConversions = sum("ownedProductConversions");
  return {
    currency: observations[0]?.currency ?? "USD",
    observationCount: observations.length,
    revenueCents,
    costCents,
    contributionMarginCents: revenueCents - costCents,
    contributionMarginRate: revenueCents > 0 ? (revenueCents - costCents) / revenueCents : null,
    platformRewardsCents: sum("platformRewardsCents"),
    affiliateRevenueCents: sum("affiliateRevenueCents"),
    ownedProductRevenueCents: sum("ownedProductRevenueCents"),
    sponsorRevenueCents: sum("sponsorRevenueCents"),
    affiliateClicks,
    affiliateConversions,
    affiliateConversionRate: affiliateClicks > 0 ? affiliateConversions / affiliateClicks : null,
    landingPageVisits: sum("landingPageVisits"),
    checkoutStarts,
    ownedProductConversions,
    ownedProductConversionRate: checkoutStarts > 0 ? ownedProductConversions / checkoutStarts : null,
    llmCostCents: sum("llmCostCents"),
    ttsCostCents: sum("ttsCostCents"),
    renderCostCents: sum("renderCostCents"),
    storageCostCents: sum("storageCostCents"),
    egressCostCents: sum("egressCostCents"),
  };
}
