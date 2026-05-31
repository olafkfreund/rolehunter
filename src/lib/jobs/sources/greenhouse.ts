// Greenhouse adapter — public Job Board API, no auth required.
// Endpoint: https://boards-api.greenhouse.io/v1/boards/{company}/jobs?content=true
//
// Pattern: profile.sources includes "greenhouse" AND
// params.targetCompanies is the list of company slugs to fetch boards from.
// Each board is fetched once; results are filtered by params.query (substring
// match on title) and params.location (substring match) post-fetch.
//
// See doc/plans/2026-05-31-rolehunter-v3-design.md §5.5.

import { SourcePermanentError, SourceTransientError, wrapUnknownError } from "./errors";
import type { JobSource, RawJob, SearchParams } from "./types";

const BASE = "https://boards-api.greenhouse.io/v1/boards";

interface GhJob {
  id: number;
  title: string;
  location: { name?: string };
  updated_at: string;
  absolute_url: string;
  content?: string;
  departments?: Array<{ name?: string }>;
  offices?: Array<{ name?: string }>;
  metadata?: Array<{ name?: string; value?: unknown }>;
  requisition_id?: string | number | null;
}

interface GhResponse {
  jobs?: GhJob[];
  meta?: { total?: number };
}

function htmlToText(html: string): string {
  // Lightweight HTML strip. The full normalize.ts run later via ingest will
  // handle Markdown conversion; this is just to avoid storing raw HTML in
  // the description column when the upstream returns it.
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function toRawJob(j: GhJob, company: string): RawJob | null {
  if (!j.id || !j.title || !j.absolute_url) return null;
  const descriptionHtml = j.content ?? "";
  const description = descriptionHtml ? htmlToText(descriptionHtml) : "";
  const locationRaw = j.location?.name ?? "";
  return {
    externalId: `${company}-${j.id}`,
    title: j.title,
    company,
    location: { raw: locationRaw || undefined },
    description,
    postedAt: j.updated_at,
    url: j.absolute_url,
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

export function createGreenhouseAdapter(): JobSource {
  return {
    id: "greenhouse",
    displayName: "Greenhouse (direct ATS)",
    available: async () => ({ ok: true }),
    costEstimate: () => 0,
    search: async (params: SearchParams, signal: AbortSignal): Promise<RawJob[]> => {
      const companies = params.targetCompanies ?? [];
      if (companies.length === 0) {
        // No companies configured — silently return empty rather than throw,
        // so a search profile with greenhouse selected but no companies set
        // doesn't fail the whole scheduler tick.
        return [];
      }

      const collected: RawJob[] = [];

      try {
        for (const company of companies) {
          if (signal.aborted) {
            throw new SourcePermanentError("aborted between Greenhouse boards");
          }
          const url = `${BASE}/${encodeURIComponent(company)}/jobs?content=true`;
          const res = await fetch(url, { signal, cache: "no-store" });

          if (!res.ok) {
            const text = await res.text().catch(() => "");
            if (res.status === 404) {
              // Unknown company board — skip silently, don't fail the whole call.
              continue;
            }
            if (res.status === 401 || res.status === 403) {
              throw new SourcePermanentError(`Greenhouse auth (${res.status}): ${text}`);
            }
            throw new SourceTransientError(`Greenhouse ${res.status}: ${text || res.statusText}`);
          }

          const json = (await res.json()) as GhResponse;
          for (const j of json.jobs ?? []) {
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
        throw wrapUnknownError(err, "greenhouse.search");
      }
    },
  };
}
