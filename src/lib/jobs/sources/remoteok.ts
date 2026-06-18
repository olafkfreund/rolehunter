// RemoteOK adapter — free public API, no auth required.
// Endpoint: https://remoteok.com/api  (array; first element is legal metadata)
//
// No server-side query, so we filter client-side. A descriptive User-Agent is
// required or RemoteOK returns an empty/blocked response. All listings remote.
// See epic #111.

import { classifyAtsError, htmlToText, matchesLocation, matchesQuery } from "./ats-shared";
import { SourceTransientError } from "./errors";
import type { JobSource, RawJob, RawSalary, SearchParams } from "./types";

const URL = "https://remoteok.com/api";
const UA = "Mozilla/5.0 (compatible; RoleHunterBot/3.6; +https://github.com/olafkfreund/rolehunter)";

interface RokJob {
  id?: string | number;
  slug?: string;
  position?: string;
  company?: string;
  location?: string;
  description?: string;
  tags?: string[];
  url?: string;
  apply_url?: string;
  date?: string;
  salary_min?: number;
  salary_max?: number;
}

function salaryOf(j: RokJob): RawSalary | undefined {
  if (!j.salary_min && !j.salary_max) return undefined;
  return { min: j.salary_min, max: j.salary_max, currency: "USD", period: "year" };
}

function toRawJob(j: RokJob): RawJob | null {
  // The leading metadata element has no `position`; this also drops malformed rows.
  if (j.id == null || !j.position) return null;
  const url = j.url || j.apply_url || "";
  if (!url) return null;
  return {
    externalId: String(j.id),
    title: j.position,
    company: j.company ?? "",
    location: { raw: j.location || undefined },
    remoteMode: "remote",
    description: j.description ? htmlToText(j.description) : "",
    salary: salaryOf(j),
    postedAt: j.date,
    url,
    rawSource: j,
  };
}

export function createRemoteOkAdapter(): JobSource {
  return {
    id: "remoteok",
    displayName: "RemoteOK (remote)",
    available: async () => ({ ok: true }),
    costEstimate: () => 0,
    search: async (params: SearchParams, signal: AbortSignal): Promise<RawJob[]> => {
      try {
        const res = await fetch(URL, {
          signal,
          cache: "no-store",
          headers: { "User-Agent": UA, Accept: "application/json" },
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new SourceTransientError(`RemoteOK ${res.status}: ${text || res.statusText}`);
        }
        const json = (await res.json()) as RokJob[];
        const collected: RawJob[] = [];
        for (const j of Array.isArray(json) ? json : []) {
          const raw = toRawJob(j);
          if (!raw) continue;
          if (!matchesQuery(raw, params.query)) continue;
          if (!matchesLocation(raw, params.location)) continue;
          collected.push(raw);
          if (collected.length >= params.maxResults) break;
        }
        return collected.slice(0, params.maxResults);
      } catch (err) {
        classifyAtsError(err, "remoteok.search");
      }
    },
  };
}
