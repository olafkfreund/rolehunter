// Orchestrates per-company enrichment. Slice 1: Wikidata + Clearbit logo.
// Layoffs.fyi / Glassdoor / Levels.fyi / Crunchbase land in later slices.
//
// Idempotent: called multiple times on the same company will re-enrich
// (callers can decide to short-circuit if enrichmentSyncedAt is fresh).

import { lookupCompanyOnWikidata } from "./sources/wikidata";
import { clearbitLogoUrl } from "./sources/clearbit";

export interface EnrichmentPayload {
  website: string | null;
  headquarters: string | null;
  foundedYear: number | null;
  summary: string;
  logoUrl: string | null;
  wikidataId: string | null;
  // Future sources fill these in. Slice 1 leaves them null.
  linkedinUrl: string | null;
  glassdoorUrl: string | null;
  hasRecentLayoff: boolean;
  lastLayoffAt: string | null;
  lastLayoffCount: number | null;
  raw: Record<string, unknown>;
}

export async function enrichCompanyByName(name: string): Promise<EnrichmentPayload> {
  const payload: EnrichmentPayload = {
    website: null,
    headquarters: null,
    foundedYear: null,
    summary: "",
    logoUrl: null,
    wikidataId: null,
    linkedinUrl: null,
    glassdoorUrl: null,
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

  return payload;
}
