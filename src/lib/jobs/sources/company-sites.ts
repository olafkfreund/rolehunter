// "Company career sites" aggregate adapter (#115).
//
// Lets users target company *names* instead of ATS slugs. For each name it
// resolves the company's ATS + slug (cached), groups slugs by ATS, then
// dispatches to the underlying Greenhouse/Lever/Ashby/Workable/SmartRecruiters
// adapter. Ingested jobs are tagged source="company_sites".

import { resolveCompanyAts, type ProbeAts } from "../ats-resolve";
import { classifyAtsError } from "./ats-shared";
import { get as getAdapter } from "./registry";
import type { JobSource, RawJob, SearchParams } from "./types";

export function createCompanySitesAdapter(): JobSource {
  return {
    id: "company_sites",
    displayName: "Company career sites (auto-detect ATS)",
    available: async () => ({ ok: true }),
    costEstimate: () => 0,
    search: async (params: SearchParams, signal: AbortSignal): Promise<RawJob[]> => {
      const names = params.targetCompanies ?? [];
      if (names.length === 0) return [];

      try {
        // Resolve each name → {ats, slug}, then group slugs by ATS.
        const byAts = new Map<ProbeAts, string[]>();
        for (const name of names) {
          if (signal.aborted) return [];
          const resolved = await resolveCompanyAts(name);
          if (!resolved) continue;
          const list = byAts.get(resolved.ats) ?? [];
          list.push(resolved.slug);
          byAts.set(resolved.ats, list);
        }
        if (byAts.size === 0) return [];

        const collected: RawJob[] = [];
        for (const [ats, slugs] of byAts) {
          if (collected.length >= params.maxResults) break;
          const adapter = getAdapter(ats);
          const remaining = params.maxResults - collected.length;
          const raw = await adapter.search(
            { ...params, targetCompanies: slugs, maxResults: remaining },
            signal,
          );
          collected.push(...raw);
        }
        return collected.slice(0, params.maxResults);
      } catch (err) {
        classifyAtsError(err, "company_sites.search");
      }
    },
  };
}
