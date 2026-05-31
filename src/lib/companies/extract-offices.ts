// Office extraction from a company's own job listings.
//
// Every job_listing has a free-text `location` field. Across all the listings
// you've ingested for one company, the distinct cities tell us where they
// genuinely operate — better than relying on Wikidata's single HQ point.
//
// Pipeline:
//   1. Pull all locations for the company
//   2. Clean each ("Remote — London, UK" → "London")
//   3. Reject non-locations ("Remote", "Multiple locations", "EU")
//   4. Dedup by normalized canonical city
//   5. Geocode each unique city via Nominatim (free, free quota)
//   6. Upsert into company_offices with source="job-locations"

import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { geocode } from "./geo";
import { upsertOffice } from "@/lib/repo/company-siblings";

// Tokens that obviously aren't a real city — match literally, case-insensitive.
const NON_LOCATIONS = new Set([
  "remote",
  "anywhere",
  "anywhere in the world",
  "anywhere in europe",
  "anywhere in us",
  "any location",
  "multiple",
  "multiple locations",
  "us",
  "usa",
  "united states",
  "united kingdom",
  "uk",
  "europe",
  "eu",
  "emea",
  "apac",
  "global",
  "worldwide",
  "north america",
  "south america",
  "asia",
  "africa",
  "n/a",
  "tbd",
  "various",
  "hybrid",
  "onsite",
  "on-site",
]);

const REMOTE_PREFIX_RX = /^(?:remote(?:\s*[-–—|/:])?\s*|hybrid(?:\s*[-–—|/:])?\s*|fully remote(?:\s*[-–—|/:])?\s*)/i;

/** Strip common prefixes / suffixes from a location string and split candidates. */
export function cleanLocationString(raw: string): string[] {
  if (!raw) return [];
  const candidates = raw
    // split on slashes, pipes, semicolons — common multi-city separators
    .split(/[\/|;]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const out: string[] = [];
  for (const c of candidates) {
    let s = c
      .replace(REMOTE_PREFIX_RX, "")
      .replace(/\(.*?\)/g, "") // strip "(Remote)" suffixes
      .replace(/\s+/g, " ")
      .trim();
    // Drop a trailing "- Hybrid" or "- Remote"
    s = s.replace(/\s*[-–—]\s*(hybrid|remote|onsite|on[- ]site)\s*$/i, "").trim();
    // Strip any orphaned leading em/en dash left after prefix removal
    s = s.replace(/^[-–—\s]+/, "").trim();
    if (s.length === 0) continue;
    out.push(s);
  }
  return out;
}

/** First non-empty comma-split fragment (the city, usually). */
export function canonicalCity(location: string): string | null {
  if (!location) return null;
  const first = location
    .split(",")[0]
    ?.trim()
    .replace(/\s+/g, " ");
  if (!first) return null;
  if (first.length < 3 || first.length > 60) return null;
  if (NON_LOCATIONS.has(first.toLowerCase())) return null;
  return first;
}

/**
 * Extract a deduplicated list of canonical city candidates (along with the
 * fullest original variant we saw — used as the address to geocode).
 */
export function distinctCityCandidates(
  rawLocations: Array<string | null | undefined>,
): Array<{ city: string; fullest: string }> {
  const map = new Map<string, string>();
  for (const raw of rawLocations) {
    if (!raw) continue;
    for (const variant of cleanLocationString(raw)) {
      const city = canonicalCity(variant);
      if (!city) continue;
      const key = city.toLowerCase();
      const prev = map.get(key);
      // Keep the longest seen variant — it has the country context for
      // higher-confidence geocoding.
      if (!prev || variant.length > prev.length) map.set(key, variant);
    }
  }
  return Array.from(map.entries()).map(([k, fullest]) => ({
    city: k.charAt(0).toUpperCase() + k.slice(1),
    fullest,
  }));
}

interface ExtractOptions {
  /** Max distinct cities to geocode per company per run (safety cap). */
  maxCities?: number;
}

/**
 * Extract office locations for a company from its own job listings,
 * geocode each via Nominatim, and upsert into company_offices.
 * Returns the count actually written (excludes skips for failed geocode).
 */
export async function extractOfficesFromJobs(
  companyId: number,
  opts: ExtractOptions = {},
): Promise<{ scanned: number; written: number }> {
  const db = getDb();
  const rows = await db
    .select({ location: schema.jobListings.location })
    .from(schema.jobListings)
    .where(eq(schema.jobListings.companyId, companyId))
    .limit(500);

  const candidates = distinctCityCandidates(rows.map((r) => r.location)).slice(
    0,
    opts.maxCities ?? 10,
  );
  let written = 0;
  for (const { city, fullest } of candidates) {
    let point: { lat: number; lng: number; displayName: string } | null = null;
    try {
      point = await geocode(fullest);
    } catch {
      // Nominatim transient errors — skip this one
      continue;
    }
    if (!point) continue;
    try {
      await upsertOffice(companyId, {
        label: city,
        address: point.displayName,
        lat: point.lat,
        lng: point.lng,
      });
      written++;
    } catch {
      // upsert failure — skip
    }
  }

  return { scanned: candidates.length, written };
}
