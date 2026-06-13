// Jobicy adapter — free public remote-jobs API v2, no auth required.
// Endpoint: https://jobicy.com/api/v2/remote-jobs?count={n}&tag={q}
//
// All listings are remote. See epic #111.

import { classifyAtsError, htmlToText, matchesLocation, matchesQuery } from "./ats-shared";
import { SourceTransientError } from "./errors";
import type { JobSource, RawJob, SearchParams } from "./types";

const BASE = "https://jobicy.com/api/v2/remote-jobs";
const MAX_COUNT = 50; // API cap

interface JyJob {
  id?: number | string;
  url?: string;
  jobTitle?: string;
  companyName?: string;
  jobType?: string | string[];
  jobGeo?: string;
  jobLevel?: string;
  jobExcerpt?: string;
  jobDescription?: string;
  pubDate?: string;
}

interface JyResponse {
  jobs?: JyJob[];
}

function toRawJob(j: JyJob): RawJob | null {
  if (j.id == null || !j.jobTitle || !j.url) return null;
  const jobType = Array.isArray(j.jobType) ? j.jobType[0] : j.jobType;
  const body = j.jobDescription || j.jobExcerpt || "";
  return {
    externalId: String(j.id),
    title: j.jobTitle,
    company: j.companyName ?? "",
    location: { raw: j.jobGeo || undefined },
    remoteMode: "remote",
    description: body ? htmlToText(body) : "",
    jobType,
    experienceLevel: j.jobLevel,
    postedAt: j.pubDate,
    url: j.url,
    rawSource: j,
  };
}

export function createJobicyAdapter(): JobSource {
  return {
    id: "jobicy",
    displayName: "Jobicy (remote)",
    available: async () => ({ ok: true }),
    costEstimate: () => 0,
    search: async (params: SearchParams, signal: AbortSignal): Promise<RawJob[]> => {
      try {
        const count = Math.min(Math.max(params.maxResults, 1), MAX_COUNT);
        const qs = new URLSearchParams({ count: String(count) });
        // Jobicy's `tag` expects a single keyword; pass it when the query is one word.
        if (params.query && !/\s/.test(params.query)) qs.set("tag", params.query);
        const res = await fetch(`${BASE}?${qs.toString()}`, { signal, cache: "no-store" });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new SourceTransientError(`Jobicy ${res.status}: ${text || res.statusText}`);
        }
        const json = (await res.json()) as JyResponse;
        const collected: RawJob[] = [];
        for (const j of json.jobs ?? []) {
          const raw = toRawJob(j);
          if (!raw) continue;
          if (!matchesQuery(raw, params.query)) continue;
          if (!matchesLocation(raw, params.location)) continue;
          collected.push(raw);
          if (collected.length >= params.maxResults) break;
        }
        return collected.slice(0, params.maxResults);
      } catch (err) {
        classifyAtsError(err, "jobicy.search");
      }
    },
  };
}
