// Company-name → {ats, slug} resolver (#115).
//
// ATS public feeds are per-company, not global: you must know a company's ATS
// and its board slug. This resolver removes both burdens — given a company
// *name* it probes the known per-ATS URL conventions and returns the first
// match, caching the result (positive and negative) in `company_ats` so the
// live HTTP probe runs once per company rather than on every search.

import { eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";

/** ATS ids the resolver knows how to probe, in priority order. */
export const PROBE_ATS = ["greenhouse", "lever", "ashby", "workable", "smartrecruiters"] as const;
export type ProbeAts = (typeof PROBE_ATS)[number];

export interface ResolvedAts {
  ats: ProbeAts;
  slug: string;
}

/** Re-probe a previously-unresolved company after this many days. */
const NEGATIVE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

const COMPANY_SUFFIXES = /\b(ltd|limited|inc|llc|plc|gmbh|corp|corporation|co|company|sa|bv|ab|oy)\b\.?/gi;

/** Lowercased lookup key for the cache. */
export function normalizeKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Candidate board slugs for a company name, most-specific first. Companies
 * almost always slug as the name with spaces/punctuation removed or hyphenated.
 */
export function slugCandidates(name: string): string[] {
  const cleaned = name
    .toLowerCase()
    .replace(COMPANY_SUFFIXES, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return [];
  const words = cleaned.split(" ").filter(Boolean);
  const out = [
    words.join(""), // acmecorp
    words.join("-"), // acme-corp
    words[0], // acme
  ].filter((s): s is string => !!s && s.length > 1);
  return Array.from(new Set(out));
}

type FetchImpl = typeof fetch;

/** True if the ATS board response for `slug` looks like a real, existing board. */
async function boardExists(ats: ProbeAts, slug: string, doFetch: FetchImpl): Promise<boolean> {
  const enc = encodeURIComponent(slug);
  const url = {
    greenhouse: `https://boards-api.greenhouse.io/v1/boards/${enc}`,
    lever: `https://api.lever.co/v0/postings/${enc}?mode=json&limit=1`,
    ashby: `https://api.ashbyhq.com/posting-api/job-board/${enc}`,
    workable: `https://apply.workable.com/api/v1/widget/accounts/${enc}`,
    smartrecruiters: `https://api.smartrecruiters.com/v1/companies/${enc}/postings?limit=1`,
  }[ats];

  let res: Response;
  try {
    res = await doFetch(url, { cache: "no-store", headers: { Accept: "application/json" } });
  } catch {
    return false;
  }
  if (!res.ok) return false;
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | unknown[] | null;
  if (!body) return false;

  // Shape sanity per ATS so a generic 200 / redirect landing page isn't a match.
  switch (ats) {
    case "greenhouse":
      return typeof (body as { name?: unknown }).name === "string" || "id" in (body as object);
    case "lever":
      return Array.isArray(body);
    case "ashby":
      return Array.isArray((body as { jobs?: unknown }).jobs);
    case "workable":
      return typeof (body as { name?: unknown }).name === "string";
    case "smartrecruiters":
      return Array.isArray((body as { content?: unknown }).content);
    default:
      return false;
  }
}

/**
 * Probe the ATS conventions for a company name (no cache). Exposed for testing;
 * pass a custom fetch to avoid real network calls.
 */
export async function probeCompanyAts(name: string, doFetch: FetchImpl = fetch): Promise<ResolvedAts | null> {
  const candidates = slugCandidates(name);
  for (const ats of PROBE_ATS) {
    for (const slug of candidates) {
      if (await boardExists(ats, slug, doFetch)) {
        return { ats, slug };
      }
    }
  }
  return null;
}

/**
 * Resolve a company name to its ATS board, using the `company_ats` cache. Probes
 * live only on a cache miss or an expired negative entry.
 */
export async function resolveCompanyAts(displayName: string): Promise<ResolvedAts | null> {
  const name = normalizeKey(displayName);
  if (!name) return null;
  const db = getDb();

  const [cached] = await db
    .select()
    .from(schema.companyAts)
    .where(eq(schema.companyAts.name, name))
    .limit(1);

  if (cached) {
    if (cached.ats && cached.slug) return { ats: cached.ats as ProbeAts, slug: cached.slug };
    // Negative cache: re-probe only after the TTL.
    const age = Date.now() - new Date(cached.checkedAt).getTime();
    if (age < NEGATIVE_TTL_MS) return null;
  }

  const resolved = await probeCompanyAts(name);

  const row = {
    name,
    displayName,
    ats: resolved?.ats ?? null,
    slug: resolved?.slug ?? null,
    resolved: true,
    checkedAt: new Date(),
  };
  await db
    .insert(schema.companyAts)
    .values(row)
    .onConflictDoUpdate({ target: schema.companyAts.name, set: row });

  return resolved;
}
