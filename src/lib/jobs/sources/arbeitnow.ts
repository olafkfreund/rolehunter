// Arbeitnow adapter — free public job-board API, no auth required.
// Endpoint: https://www.arbeitnow.com/api/job-board-api  (paginated feed)
//
// The free API is a latest-jobs FEED, not a search — it ignores query params —
// so we page through it and filter client-side by params.query / params.location
// (same approach as the ATS adapters). DACH + remote-EU coverage, employer-direct
// (powered by ATSs). See epic #111.

import { classifyAtsError, htmlToText, matchesLocation, matchesQuery } from "./ats-shared";
import { SourcePermanentError, SourceTransientError } from "./errors";
import type { JobSource, RawJob, RemoteMode, SearchParams } from "./types";

const BASE = "https://www.arbeitnow.com/api/job-board-api";
const MAX_PAGES = 5;

interface AnJob {
  slug?: string;
  company_name?: string;
  title?: string;
  description?: string;
  remote?: boolean;
  url?: string;
  tags?: string[];
  job_types?: string[];
  location?: string;
  created_at?: number;
}

interface AnResponse {
  data?: AnJob[];
  links?: { next?: string | null };
}

function toRawJob(j: AnJob): RawJob | null {
  if (!j.slug || !j.title || !j.url) return null;
  const remoteMode: RemoteMode | undefined = j.remote === true ? "remote" : undefined;
  return {
    externalId: j.slug,
    title: j.title,
    company: j.company_name ?? "",
    location: { raw: j.location || undefined },
    remoteMode,
    description: j.description ? htmlToText(j.description) : "",
    jobType: j.job_types?.[0],
    postedAt: j.created_at ? new Date(j.created_at * 1000).toISOString() : undefined,
    url: j.url,
    rawSource: j,
  };
}

export function createArbeitnowAdapter(): JobSource {
  return {
    id: "arbeitnow",
    displayName: "Arbeitnow (EU / DACH + remote)",
    available: async () => ({ ok: true }),
    costEstimate: () => 0,
    search: async (params: SearchParams, signal: AbortSignal): Promise<RawJob[]> => {
      const collected: RawJob[] = [];
      try {
        let url: string | null = `${BASE}?page=1`;
        for (let page = 0; page < MAX_PAGES && url; page++) {
          if (signal.aborted) throw new SourcePermanentError("aborted between Arbeitnow pages");
          const res = await fetch(url, { signal, cache: "no-store" });
          if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new SourceTransientError(`Arbeitnow ${res.status}: ${text || res.statusText}`);
          }
          const json = (await res.json()) as AnResponse;
          for (const j of json.data ?? []) {
            const raw = toRawJob(j);
            if (!raw) continue;
            if (!matchesQuery(raw, params.query)) continue;
            if (!matchesLocation(raw, params.location)) continue;
            collected.push(raw);
            if (collected.length >= params.maxResults) break;
          }
          if (collected.length >= params.maxResults) break;
          url = json.links?.next ?? null;
        }
        return collected.slice(0, params.maxResults);
      } catch (err) {
        classifyAtsError(err, "arbeitnow.search");
      }
    },
  };
}
