// Orchestrates per-company enrichment. Slice 1: Wikidata + Clearbit logo.
// Layoffs.fyi / Glassdoor / Levels.fyi / Crunchbase land in later slices.
//
// Idempotent: called multiple times on the same company will re-enrich
// (callers can decide to short-circuit if enrichmentSyncedAt is fresh).

import { lookupCompanyOnWikidata } from "./sources/wikidata";
import { clearbitLogoUrl } from "./sources/clearbit";
import { lookupCompanyOnGlassdoor } from "./sources/glassdoor-apify";
import { geocode } from "./geo";

export interface EnrichmentPayload {
  website: string | null;
  headquarters: string | null;
  hqLat: number | null;
  hqLng: number | null;
  foundedYear: number | null;
  summary: string;
  logoUrl: string | null;
  wikidataId: string | null;
  linkedinUrl: string | null;
  glassdoorUrl: string | null;
  // Glassdoor enrichment (slice 3 — null if APIFY_GLASSDOOR_ACTOR_ID unset)
  glassdoorRating: number | null;
  glassdoorReviewCount: number | null;
  glassdoorRecommendPct: number | null;
  glassdoorCeoApprovalPct: number | null;
  glassdoorTopPro: string | null;
  glassdoorTopCon: string | null;
  glassdoorAttempted: boolean;
  // Layoffs (future slice)
  hasRecentLayoff: boolean;
  lastLayoffAt: string | null;
  lastLayoffCount: number | null;
  raw: Record<string, unknown>;
}

// HQ strings that are too broad to geocode usefully — Nominatim returns the
// country centroid which makes "distance from home" nonsense. Skip them.
const TOO_BROAD = new Set([
  "united states",
  "usa",
  "us",
  "united kingdom",
  "uk",
  "europe",
  "asia",
  "north america",
  "worldwide",
  "global",
  "remote",
]);

export async function enrichCompanyByName(name: string): Promise<EnrichmentPayload> {
  const payload: EnrichmentPayload = {
    website: null,
    headquarters: null,
    hqLat: null,
    hqLng: null,
    foundedYear: null,
    summary: "",
    logoUrl: null,
    wikidataId: null,
    linkedinUrl: null,
    glassdoorUrl: null,
    glassdoorRating: null,
    glassdoorReviewCount: null,
    glassdoorRecommendPct: null,
    glassdoorCeoApprovalPct: null,
    glassdoorTopPro: null,
    glassdoorTopCon: null,
    glassdoorAttempted: false,
    hasRecentLayoff: false,
    lastLayoffAt: null,
    lastLayoffCount: null,
    raw: {},
  };

  // Wikidata
  try {
    const wd = await lookupCompanyOnWikidata(name);
    if (wd) {
      payload.website = wd.website ?? null;
      payload.headquarters = wd.headquarters ?? null;
      payload.foundedYear = wd.foundedYear ?? null;
      payload.summary = wd.description ?? "";
      payload.wikidataId = wd.qid;
      payload.raw.wikidata = {
        qid: wd.qid,
        matchedAs: wd.name,
        matchKind: wd.matchKind,
      };
    }
  } catch (e) {
    payload.raw.wikidataError = e instanceof Error ? e.message : String(e);
  }

  // Clearbit logo (pure URL builder; the URL may 404 on actual fetch by the
  // browser, but that's fine — img tag will hide and we fall back to initials)
  payload.logoUrl = clearbitLogoUrl(payload.website);

  // Geocode HQ via Nominatim (free). Skip if too broad / too short to be
  // useful — country-centroid coords make distance meaningless.
  if (payload.headquarters) {
    const hq = payload.headquarters.trim();
    const norm = hq.toLowerCase();
    if (hq.length >= 3 && !TOO_BROAD.has(norm)) {
      try {
        const point = await geocode(hq);
        if (point) {
          payload.hqLat = point.lat;
          payload.hqLng = point.lng;
          payload.raw.hqGeocoded = {
            via: "nominatim",
            displayName: point.displayName,
          };
        }
      } catch (e) {
        payload.raw.hqGeocodeError = e instanceof Error ? e.message : String(e);
      }
    } else {
      payload.raw.hqGeocodeSkipped = `too broad: '${hq}'`;
    }
  }

  // Glassdoor via Apify — only runs if APIFY_GLASSDOOR_ACTOR_ID is set.
  // lookupCompanyOnGlassdoor returns null when the env is missing, in which
  // case glassdoorAttempted stays false and the UI shows the "configure to
  // unlock" hint.
  try {
    const gd = await lookupCompanyOnGlassdoor(name, {
      glassdoorUrl: payload.glassdoorUrl,
    });
    if (gd) {
      payload.glassdoorAttempted = true;
      payload.glassdoorRating = gd.rating;
      payload.glassdoorReviewCount = gd.reviewCount;
      payload.glassdoorRecommendPct = gd.recommendPct;
      payload.glassdoorCeoApprovalPct = gd.ceoApprovalPct;
      payload.glassdoorTopPro = gd.proSummary;
      payload.glassdoorTopCon = gd.conSummary;
      if (gd.url) payload.glassdoorUrl = gd.url;
      payload.raw.glassdoor = {
        url: gd.url,
        rating: gd.rating,
        reviewCount: gd.reviewCount,
      };
    }
  } catch (e) {
    payload.glassdoorAttempted = true;
    payload.raw.glassdoorError = e instanceof Error ? e.message : String(e);
  }

  return payload;
}
