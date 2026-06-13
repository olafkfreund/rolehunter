// Per-source cost model + env overrides.
// See doc/plans/2026-05-31-rolehunter-v3-design.md §9.2.

import type { JobSourceId } from "./types";

export type BudgetKey = JobSourceId | "auto_score";

export interface PricingEntry {
  perCall: number;
  unit: string;
}

const BASE_PRICING: Record<BudgetKey, PricingEntry> = {
  paste:      { perCall: 0,      unit: "free" },
  jsearch:    { perCall: 0,      unit: "rapidapi-included" },
  linkedin:   { perCall: 0,      unit: "rapidapi-included" },
  adzuna:     { perCall: 0,      unit: "free-quota" },
  indeed:     { perCall: 0,      unit: "partner-free" },
  dice:       { perCall: 0,      unit: "free" },
  jobspy:     { perCall: 0,      unit: "free-library" },
  apify:      { perCall: 0.05,   unit: "usd-per-actor-run" },
  glassdoor:  { perCall: 0.05,   unit: "usd-per-actor-run" },
  reed:       { perCall: 0,      unit: "free-developer-api" },
  greenhouse: { perCall: 0,      unit: "free-public-api" },
  lever:      { perCall: 0,      unit: "free-public-api" },
  workday:    { perCall: 0,      unit: "free-public-json" },
  workable:   { perCall: 0,      unit: "free-public-api" },
  ashby:      { perCall: 0,      unit: "free-public-api" },
  smartrecruiters: { perCall: 0, unit: "free-public-api" },
  company_sites: { perCall: 0, unit: "free-public-api" },
  auto_score: { perCall: 0.0008, unit: "usd-claude-haiku" },
};

let cachedPricing: Record<BudgetKey, PricingEntry> | null = null;

export function getPricing(): Record<BudgetKey, PricingEntry> {
  if (cachedPricing) return cachedPricing;
  const overrides = process.env.PRICING_OVERRIDES_JSON;
  if (!overrides) {
    cachedPricing = BASE_PRICING;
    return cachedPricing;
  }
  try {
    const parsed = JSON.parse(overrides) as Partial<Record<BudgetKey, Partial<PricingEntry>>>;
    cachedPricing = { ...BASE_PRICING };
    for (const [key, entry] of Object.entries(parsed) as [BudgetKey, Partial<PricingEntry>][]) {
      if (!(key in BASE_PRICING)) continue;
      cachedPricing[key] = { ...BASE_PRICING[key], ...entry };
    }
  } catch (err) {
    console.warn("[pricing] failed to parse PRICING_OVERRIDES_JSON, using defaults", err);
    cachedPricing = BASE_PRICING;
  }
  return cachedPricing;
}

export function estimatedCostFor(source: BudgetKey): number {
  return getPricing()[source]?.perCall ?? 0;
}

export function monthlyCapFor(source: BudgetKey): number {
  switch (source) {
    case "apify":
    case "glassdoor":
      return Number(process.env.BUDGET_APIFY_USD_MONTHLY ?? 5);
    case "auto_score":
      return Number(process.env.BUDGET_AUTO_SCORE_USD_MONTHLY ?? 10);
    default:
      return Infinity;
  }
}

export function dailyCallCapFor(source: BudgetKey): number {
  if (source === "adzuna") {
    return Number(process.env.BUDGET_ADZUNA_DAILY_CALLS ?? 240);
  }
  return Infinity;
}
