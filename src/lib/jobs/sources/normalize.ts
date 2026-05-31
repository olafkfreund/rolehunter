// Normalize a RawJob into the insert shape for job_listings.
// Pure function — no DB, no network. See doc/plans/2026-05-31-rolehunter-v3-design.md §7.2.

import type { jobListings } from "@/lib/db/schema";
import { dedupeHash } from "./dedupe";
import type { JobSourceId, RawJob, SalaryPeriod, SourceSighting } from "./types";

type JobListingInsert = typeof jobListings.$inferInsert;

// 2080 = 40h/week × 52 weeks; standard FTE annualization.
const HOURS_PER_YEAR = 2080;
const MONTHS_PER_YEAR = 12;

function annualize(amount: number, period: SalaryPeriod | undefined): number {
  if (!amount) return amount;
  switch (period) {
    case "hour":
      return Math.round(amount * HOURS_PER_YEAR);
    case "month":
      return Math.round(amount * MONTHS_PER_YEAR);
    case "year":
    default:
      return Math.round(amount);
  }
}

function detectRemoteMode(raw: RawJob): RawJob["remoteMode"] | undefined {
  if (raw.remoteMode) return raw.remoteMode;
  const haystack = `${raw.title}\n${raw.description}`.toLowerCase();
  if (/\bremote(\W|$)/.test(haystack) && !/\bnot remote\b/.test(haystack)) return "remote";
  if (/\bhybrid\b/.test(haystack)) return "hybrid";
  if (/\bon[-\s]?site\b/.test(haystack) || /\bin[-\s]?office\b/.test(haystack)) return "onsite";
  return undefined;
}

function locationString(raw: RawJob): string {
  if (raw.location?.raw) return raw.location.raw;
  const parts = [raw.location?.city, raw.location?.region, raw.location?.country].filter(Boolean);
  return parts.join(", ");
}

function buildSighting(source: JobSourceId, raw: RawJob): SourceSighting {
  return {
    source,
    externalId: raw.externalId,
    url: raw.url ?? "",
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Normalize a RawJob from an adapter into the insert shape for job_listings.
 * The caller is responsible for actually performing the insert/merge — this is
 * a pure transformation.
 */
export function normalizeForInsert(
  raw: RawJob,
  source: JobSourceId,
  searchProfileId: number | null = null,
): JobListingInsert {
  const remoteMode = detectRemoteMode(raw);
  const description = raw.description?.trim() ?? "";
  const salaryMin = raw.salary?.min ? annualize(raw.salary.min, raw.salary.period) : null;
  const salaryMax = raw.salary?.max ? annualize(raw.salary.max, raw.salary.period) : null;
  // Embed v3-only fields (remoteMode) into rawJson so adapters can preserve adapter-specific
  // hints without bloating the column set.
  const rawJson = {
    remoteMode,
    experienceLevel: raw.experienceLevel,
    jobType: raw.jobType,
    companyUrl: raw.companyUrl,
    raw: raw.rawSource,
  };
  return {
    source,
    externalId: raw.externalId,
    title: raw.title.trim(),
    company: raw.company?.trim() ?? "",
    location: locationString(raw),
    url: raw.url ?? null,
    description,
    postedAt: raw.postedAt ? new Date(raw.postedAt) : null,
    salaryMin,
    salaryMax,
    salaryCurrency: raw.salary?.currency ?? null,
    rawJson,
    dedupeHash: dedupeHash(raw),
    sourcesSeen: [buildSighting(source, raw)],
    fetchedAt: new Date(),
    topScore: null,
    searchProfileId,
  };
}
