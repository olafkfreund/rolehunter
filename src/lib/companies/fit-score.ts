// Per-company weighted fit score. Combines:
//   - Glassdoor rating (0-5 → 0-100)
//   - Glassdoor recommend % (0-100)
//   - Layoff signal (recent layoff drags hard)
//   - Distance from user's home (closer = better; can be replaced by real
//     commute time when GOOGLE_MAPS_API_KEY is set)
//   - Benefit coverage vs user's ordered priorities (each priority is worth
//     more than the next; missing top priority hurts more)
//
// Stored in company_fit_scores as a cached value with a breakdown blob so
// the UI can show how the score was assembled. Refreshed when a company
// is enriched or when the user updates their preferences.

import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type {
  Company,
  CompanyBenefit,
  CompanyFitScore,
  CompanyLayoff,
  Profile,
} from "@/lib/db/schema";
import { haversineKm } from "./geo";

export interface FitFactor {
  key: string;
  label: string;
  weight: number; // higher = matters more
  contribution: number; // 0-100, normalised
  detail: string;
}

export interface CompanyFitBreakdown {
  factors: FitFactor[];
  score: number; // 0-100, weighted average across factors with weight > 0
  computedAt: string; // ISO
}

interface InputBundle {
  company: Company;
  profile: Profile | null;
  layoffs: CompanyLayoff[];
  benefits: CompanyBenefit[];
}

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, n));
}

function ratingFactor(c: Company): FitFactor | null {
  if (c.glassdoorRating == null) return null;
  const r = Number(c.glassdoorRating); // 0-5
  if (!Number.isFinite(r) || r < 0) return null;
  return {
    key: "glassdoor-rating",
    label: "Glassdoor rating",
    weight: 2,
    contribution: clamp((r / 5) * 100),
    detail: `${r.toFixed(1)} / 5`,
  };
}

function recommendFactor(c: Company): FitFactor | null {
  if (c.glassdoorRecommendPct == null) return null;
  const pct = Number(c.glassdoorRecommendPct);
  if (!Number.isFinite(pct)) return null;
  return {
    key: "glassdoor-recommend",
    label: "Would-recommend %",
    weight: 1,
    contribution: clamp(pct),
    detail: `${Math.round(pct)}%`,
  };
}

function layoffFactor(c: Company, layoffs: CompanyLayoff[]): FitFactor | null {
  if (!c.hasRecentLayoff && layoffs.length === 0) {
    return {
      key: "layoff",
      label: "Layoff history",
      weight: 1,
      contribution: 100,
      detail: "no recent layoff on record",
    };
  }
  // Score drops based on recency. Within last 6 months = 0; 6–12 months = 30;
  // 12–24 months = 60; >24 months = 80.
  let mostRecent: Date | null = c.lastLayoffAt ? new Date(c.lastLayoffAt) : null;
  for (const l of layoffs) {
    const d = new Date(l.announcedAt);
    if (!mostRecent || d > mostRecent) mostRecent = d;
  }
  if (!mostRecent) {
    return {
      key: "layoff",
      label: "Layoff history",
      weight: 1,
      contribution: 100,
      detail: "no recent layoff on record",
    };
  }
  const ageDays = (Date.now() - mostRecent.getTime()) / (24 * 60 * 60 * 1000);
  let contribution: number;
  if (ageDays < 180) contribution = 0;
  else if (ageDays < 365) contribution = 30;
  else if (ageDays < 730) contribution = 60;
  else contribution = 80;
  return {
    key: "layoff",
    label: "Layoff history",
    weight: 2,
    contribution,
    detail: `last layoff ${Math.round(ageDays)}d ago${c.lastLayoffCount ? `, ~${c.lastLayoffCount.toLocaleString()} affected` : ""}`,
  };
}

function commuteFactor(c: Company, profile: Profile | null): FitFactor | null {
  if (
    c.hqLat == null ||
    c.hqLng == null ||
    !profile ||
    profile.homeLat == null ||
    profile.homeLng == null
  ) {
    return null;
  }
  const km = haversineKm(
    { lat: profile.homeLat, lng: profile.homeLng, displayName: "" },
    { lat: c.hqLat, lng: c.hqLng, displayName: "" },
  );
  let contribution: number;
  if (km <= 10) contribution = 100;
  else if (km <= 30) contribution = 85;
  else if (km <= 80) contribution = 70;
  else if (km <= 200) contribution = 45;
  else if (km <= 1000) contribution = 20;
  else contribution = 5;
  return {
    key: "commute",
    label: "Distance from home",
    weight: 2,
    contribution,
    detail: `${Math.round(km).toLocaleString()} km straight-line`,
  };
}

function benefitsFactor(
  profile: Profile | null,
  benefits: CompanyBenefit[],
): FitFactor | null {
  const priorities = ((profile?.benefitPriorities as unknown as string[]) ?? []).filter(
    (v) => typeof v === "string",
  );
  if (priorities.length === 0 || benefits.length === 0) return null;

  // Categories the company actually offers (deduped).
  const offered = new Set(benefits.map((b) => b.category));
  // Each priority is worth 100 × (1 / position), so the top priority is
  // worth 100, the second 50, the third 33, etc. Normalise to [0,100].
  let earned = 0;
  let possible = 0;
  priorities.forEach((p, idx) => {
    const weight = 100 / (idx + 1);
    possible += weight;
    if (offered.has(p)) earned += weight;
  });
  const contribution = possible > 0 ? clamp((earned / possible) * 100) : 0;
  const matched = priorities.filter((p) => offered.has(p));
  return {
    key: "benefits",
    label: "Benefits priorities",
    weight: 2,
    contribution,
    detail: `${matched.length}/${priorities.length} of your priorities covered${matched.length > 0 ? ": " + matched.join(", ") : ""}`,
  };
}

/**
 * Compute the per-company fit score from cached signals. Pure function over
 * the input bundle — call sites assemble the bundle, then write the result
 * to company_fit_scores via upsertCompanyFitScore().
 */
export function computeCompanyFitScore(input: InputBundle): CompanyFitBreakdown {
  const factors: FitFactor[] = [];
  const r = ratingFactor(input.company);
  if (r) factors.push(r);
  const rec = recommendFactor(input.company);
  if (rec) factors.push(rec);
  const lay = layoffFactor(input.company, input.layoffs);
  if (lay) factors.push(lay);
  const com = commuteFactor(input.company, input.profile);
  if (com) factors.push(com);
  const ben = benefitsFactor(input.profile, input.benefits);
  if (ben) factors.push(ben);

  let totalWeight = 0;
  let weighted = 0;
  for (const f of factors) {
    totalWeight += f.weight;
    weighted += f.contribution * f.weight;
  }
  const score = totalWeight > 0 ? Math.round(weighted / totalWeight) : 0;

  return {
    factors,
    score,
    computedAt: new Date().toISOString(),
  };
}

/** Upsert into company_fit_scores. Refreshes the unique-on-company-id row. */
export async function upsertCompanyFitScore(
  companyId: number,
  breakdown: CompanyFitBreakdown,
): Promise<CompanyFitScore> {
  const db = getDb();
  const existing = await db
    .select()
    .from(schema.companyFitScores)
    .where(eq(schema.companyFitScores.companyId, companyId))
    .limit(1);
  if (existing[0]) {
    const [row] = await db
      .update(schema.companyFitScores)
      .set({
        score: breakdown.score,
        breakdownJson: breakdown as unknown as Record<string, unknown>,
        computedAt: new Date(),
      })
      .where(eq(schema.companyFitScores.id, existing[0].id))
      .returning();
    return row;
  }
  const [row] = await db
    .insert(schema.companyFitScores)
    .values({
      companyId,
      score: breakdown.score,
      breakdownJson: breakdown as unknown as Record<string, unknown>,
    })
    .returning();
  return row;
}

export async function getCompanyFitScore(
  companyId: number,
): Promise<CompanyFitScore | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.companyFitScores)
    .where(eq(schema.companyFitScores.companyId, companyId))
    .orderBy(desc(schema.companyFitScores.computedAt))
    .limit(1);
  return rows[0] ?? null;
}
