// Lever adapter — public Postings API, no auth required.
// Endpoint: https://api.lever.co/v0/postings/{company}?mode=json
//
// See doc/plans/2026-05-31-rolehunter-v3-design.md §5.5.

import { SourcePermanentError, SourceTransientError, wrapUnknownError } from "./errors";
import type { JobSource, RawJob, SearchParams } from "./types";

const BASE = "https://api.lever.co/v0/postings";

interface LeverPosting {
  id: string;
  text: string;
  hostedUrl?: string;
  applyUrl?: string;
  description?: string;
  descriptionPlain?: string;
  additional?: string;
  additionalPlain?: string;
  createdAt?: number;
  categories?: {
    team?: string;
    department?: string;
    commitment?: string;
    location?: string;
    allLocations?: string[];
  };
  lists?: Array<{ text: string; content: string }>;
  workplaceType?: string;
}

function toRawJob(j: LeverPosting, company: string): RawJob | null {
  if (!j.id || !j.text) return null;
  const url = j.hostedUrl ?? j.applyUrl ?? "";
  if (!url) return null;

  // Build a clean description from the structured Lever shape:
  //   posting.descriptionPlain + each list.content + additionalPlain
  const parts: string[] = [];
  if (j.descriptionPlain) parts.push(j.descriptionPlain);
  for (const l of j.lists ?? []) {
    parts.push(`\n## ${l.text}\n${l.content.replace(/<[^>]+>/g, "")}`);
  }
  if (j.additionalPlain) parts.push(`\n## Additional\n${j.additionalPlain}`);
  const description = parts.join("\n\n").trim();

  const remoteMode: RawJob["remoteMode"] =
    j.workplaceType === "remote"
      ? "remote"
      : j.workplaceType === "hybrid"
      ? "hybrid"
      : j.workplaceType === "onsite" || j.workplaceType === "on-site"
      ? "onsite"
      : undefined;

  return {
    externalId: `${company}-${j.id}`,
    title: j.text,
    company,
    location: { raw: j.categories?.location || j.categories?.allLocations?.[0] },
    remoteMode,
    description,
    jobType: j.categories?.commitment,
    postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : undefined,
    url,
    rawSource: j,
  };
}

function matchesQuery(j: RawJob, query: string): boolean {
  if (!query) return true;
  const needles = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (needles.length === 0) return true;
  const haystack = `${j.title} ${j.description}`.toLowerCase();
  return needles.every((n) => haystack.includes(n));
}

function matchesLocation(j: RawJob, location: string | undefined): boolean {
  if (!location) return true;
  const raw = j.location?.raw?.toLowerCase() ?? "";
  return raw.includes(location.toLowerCase());
}

export function createLeverAdapter(): JobSource {
  return {
    id: "lever",
    displayName: "Lever (direct ATS)",
    available: async () => ({ ok: true }),
    costEstimate: () => 0,
    search: async (params: SearchParams, signal: AbortSignal): Promise<RawJob[]> => {
      const companies = params.targetCompanies ?? [];
      if (companies.length === 0) return [];

      const collected: RawJob[] = [];
      try {
        for (const company of companies) {
          if (signal.aborted) {
            throw new SourcePermanentError("aborted between Lever boards");
          }
          const url = `${BASE}/${encodeURIComponent(company)}?mode=json`;
          const res = await fetch(url, { signal, cache: "no-store" });

          if (!res.ok) {
            const text = await res.text().catch(() => "");
            if (res.status === 404) continue;
            if (res.status === 401 || res.status === 403) {
              throw new SourcePermanentError(`Lever auth (${res.status}): ${text}`);
            }
            throw new SourceTransientError(`Lever ${res.status}: ${text || res.statusText}`);
          }

          const json = (await res.json()) as LeverPosting[];
          for (const j of json) {
            const raw = toRawJob(j, company);
            if (!raw) continue;
            if (!matchesQuery(raw, params.query)) continue;
            if (!matchesLocation(raw, params.location)) continue;
            collected.push(raw);
            if (collected.length >= params.maxResults) break;
          }
          if (collected.length >= params.maxResults) break;
        }
        return collected.slice(0, params.maxResults);
      } catch (err) {
        if (err instanceof SourcePermanentError || err instanceof SourceTransientError) throw err;
        const msg = err instanceof Error ? err.message : String(err);
        if (/aborted/i.test(msg)) throw new SourcePermanentError(msg, { cause: err });
        if (/network|timeout|ECONN|ETIMEDOUT|fetch failed/i.test(msg)) {
          throw new SourceTransientError(msg, { cause: err });
        }
        throw wrapUnknownError(err, "lever.search");
      }
    },
  };
}
