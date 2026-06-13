// Remotive adapter — free public remote-jobs API, no auth required.
// Endpoint: https://remotive.com/api/remote-jobs?search={q}&limit={n}
//
// All listings are remote. See epic #111.

import { classifyAtsError, htmlToText, matchesLocation, matchesQuery } from "./ats-shared";
import { SourceTransientError } from "./errors";
import type { JobSource, RawJob, SearchParams } from "./types";

const BASE = "https://remotive.com/api/remote-jobs";

interface RmJob {
  id?: number;
  url?: string;
  title?: string;
  company_name?: string;
  job_type?: string;
  publication_date?: string;
  candidate_required_location?: string;
  description?: string;
}

interface RmResponse {
  jobs?: RmJob[];
}

function toRawJob(j: RmJob): RawJob | null {
  if (j.id == null || !j.title || !j.url) return null;
  return {
    externalId: String(j.id),
    title: j.title,
    company: j.company_name ?? "",
    location: { raw: j.candidate_required_location || undefined },
    remoteMode: "remote",
    description: j.description ? htmlToText(j.description) : "",
    jobType: j.job_type,
    postedAt: j.publication_date,
    url: j.url,
    rawSource: j,
  };
}

export function createRemotiveAdapter(): JobSource {
  return {
    id: "remotive",
    displayName: "Remotive (remote)",
    available: async () => ({ ok: true }),
    costEstimate: () => 0,
    search: async (params: SearchParams, signal: AbortSignal): Promise<RawJob[]> => {
      try {
        const qs = new URLSearchParams({ limit: String(params.maxResults) });
        if (params.query) qs.set("search", params.query);
        const res = await fetch(`${BASE}?${qs.toString()}`, { signal, cache: "no-store" });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new SourceTransientError(`Remotive ${res.status}: ${text || res.statusText}`);
        }
        const json = (await res.json()) as RmResponse;
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
        classifyAtsError(err, "remotive.search");
      }
    },
  };
}
