// Levels.fyi salary scraping via Apify. Returns NewBenefit-shape entries
// representing compensation bands per level. Skips silently when
// APIFY_API_TOKEN or APIFY_LEVELS_FYI_ACTOR_ID is unset.

import type { NewBenefit } from "@/lib/repo/company-siblings";
import { pickNum, pickStr, runApifyActor } from "./apify-base";

export interface LevelsFyiRow {
  level: string | null;
  title: string | null;
  totalCompUsd: number | null;
  baseUsd: number | null;
  stockUsd: number | null;
  bonusUsd: number | null;
  sampleSize: number | null;
}

export async function lookupCompanyOnLevelsFyi(
  companyName: string,
): Promise<LevelsFyiRow[] | null> {
  const token = process.env.APIFY_API_TOKEN;
  const actorId = process.env.APIFY_LEVELS_FYI_ACTOR_ID;
  if (!token || !actorId) return null;
  if (!companyName.trim()) return null;

  const input: Record<string, unknown> = {
    companies: [companyName.trim()],
    companyNames: [companyName.trim()],
    company: companyName.trim(),
    maxItems: 25,
    maxResults: 25,
  };
  const items = await runApifyActor<Record<string, unknown>>(actorId, token, input, {
    itemLimit: 50,
  });

  return items.map((r): LevelsFyiRow => {
    const compObj = (r.compensation ?? r.totalComp ?? r) as Record<string, unknown>;
    const totalUsd =
      pickNum(compObj.total) ??
      pickNum(r.totalCompUsd) ??
      pickNum(r.median) ??
      pickNum(r.tc);
    return {
      level: pickStr(r.level ?? r.levelName ?? r.tier),
      title: pickStr(r.title ?? r.role ?? r.jobTitle),
      totalCompUsd: totalUsd,
      baseUsd: pickNum(compObj.base ?? r.baseUsd),
      stockUsd: pickNum(compObj.stock ?? r.stockUsd ?? r.equity),
      bonusUsd: pickNum(compObj.bonus ?? r.bonusUsd),
      sampleSize: pickNum(r.sampleSize ?? r.n),
    };
  });
}

/** Convert Levels.fyi rows into NewBenefit entries for the benefits table. */
export function rowsToBenefits(rows: LevelsFyiRow[]): NewBenefit[] {
  const benefits: NewBenefit[] = [];
  for (const r of rows) {
    if (!r.title && !r.level) continue;
    const label = [r.level, r.title].filter(Boolean).join(" / ");
    const parts: string[] = [];
    if (r.totalCompUsd) parts.push(`TC $${r.totalCompUsd.toLocaleString()}`);
    if (r.baseUsd) parts.push(`base $${r.baseUsd.toLocaleString()}`);
    if (r.stockUsd) parts.push(`stock $${r.stockUsd.toLocaleString()}`);
    if (r.bonusUsd) parts.push(`bonus $${r.bonusUsd.toLocaleString()}`);
    if (parts.length === 0) continue;
    benefits.push({
      category: "equity",
      description: label || "comp data",
      valueText: parts.join(" · "),
      source: "levels.fyi",
      rawJson: r as unknown as Record<string, unknown>,
    });
  }
  return benefits;
}
