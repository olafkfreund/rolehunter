// Layoffs.fyi-style data via Apify. Returns NewLayoff-shape entries.
// Skips silently when APIFY_API_TOKEN or APIFY_LAYOFFS_ACTOR_ID is unset.

import type { NewLayoff } from "@/lib/repo/company-siblings";
import { pickNum, pickStr, runApifyActor } from "./apify-base";

export interface LayoffEvent {
  announcedAt: string;
  affectedCount: number | null;
  percentOfWorkforce: number | null;
  summary: string;
  sourceUrl: string | null;
  rawJson: Record<string, unknown>;
}

function parseDate(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

export async function lookupCompanyLayoffs(
  companyName: string,
): Promise<LayoffEvent[] | null> {
  const token = process.env.APIFY_API_TOKEN;
  const actorId = process.env.APIFY_LAYOFFS_ACTOR_ID;
  if (!token || !actorId) return null;
  if (!companyName.trim()) return null;

  const input: Record<string, unknown> = {
    companies: [companyName.trim()],
    companyNames: [companyName.trim()],
    company: companyName.trim(),
    maxItems: 25,
  };
  const items = await runApifyActor<Record<string, unknown>>(actorId, token, input, {
    itemLimit: 50,
  });

  const out: LayoffEvent[] = [];
  for (const r of items) {
    const date =
      parseDate(r.date) ?? parseDate(r.announcedAt) ?? parseDate(r.reportedAt);
    if (!date) continue;
    out.push({
      announcedAt: date,
      affectedCount: pickNum(r.laidOff ?? r.affectedCount ?? r.count ?? r.totalLaidOff),
      percentOfWorkforce: pickNum(r.percent ?? r.percentOfWorkforce ?? r.percentLaidOff),
      summary: pickStr(r.summary ?? r.description ?? r.notes) ?? "",
      sourceUrl: pickStr(r.source ?? r.sourceUrl ?? r.url),
      rawJson: r,
    });
  }
  return out;
}

export function eventsToNewLayoffs(events: LayoffEvent[]): NewLayoff[] {
  return events.map((e) => ({
    announcedAt: e.announcedAt,
    affectedCount: e.affectedCount,
    percentOfWorkforce: e.percentOfWorkforce,
    sourceUrl: e.sourceUrl,
    summary: e.summary,
    rawJson: e.rawJson,
  }));
}
