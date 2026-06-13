// Himalayas adapter — free public remote-jobs API, no auth required.
// Endpoint: https://himalayas.app/jobs/api?limit={n}  (limit capped at 20)
//
// No server-side query, so we filter client-side. Listings have no numeric id —
// `guid` is the stable identifier. All listings remote. See epic #111.

import { classifyAtsError, htmlToText, matchesLocation, matchesQuery } from "./ats-shared";
import { SourceTransientError } from "./errors";
import type { JobSource, RawJob, RawSalary, SalaryPeriod, SearchParams } from "./types";

const BASE = "https://himalayas.app/jobs/api";
const MAX_LIMIT = 20; // API cap

interface HmJob {
  guid?: string;
  title?: string;
  companyName?: string;
  employmentType?: string;
  minSalary?: number;
  maxSalary?: number;
  currency?: string;
  salaryPeriod?: string;
  seniority?: string | string[];
  locationRestrictions?: string[];
  description?: string;
  excerpt?: string;
  pubDate?: string | number;
  applicationLink?: string;
}

function salaryOf(j: HmJob): RawSalary | undefined {
  if (!j.minSalary && !j.maxSalary) return undefined;
  const period: SalaryPeriod | undefined =
    j.salaryPeriod === "year" || j.salaryPeriod === "month" || j.salaryPeriod === "hour"
      ? j.salaryPeriod
      : undefined;
  return { min: j.minSalary, max: j.maxSalary, currency: j.currency ?? "USD", period };
}

function toIso(d: string | number | undefined): string | undefined {
  if (d == null) return undefined;
  const date = typeof d === "number" ? new Date(d * 1000) : new Date(d);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function toRawJob(j: HmJob): RawJob | null {
  if (!j.guid || !j.title || !j.applicationLink) return null;
  const seniority = Array.isArray(j.seniority) ? j.seniority[0] : j.seniority;
  const body = j.description || j.excerpt || "";
  return {
    externalId: j.guid,
    title: j.title,
    company: j.companyName ?? "",
    location: { raw: j.locationRestrictions?.length ? j.locationRestrictions.join(", ") : undefined },
    remoteMode: "remote",
    description: body ? htmlToText(body) : "",
    salary: salaryOf(j),
    jobType: j.employmentType,
    experienceLevel: seniority,
    postedAt: toIso(j.pubDate),
    url: j.applicationLink,
    rawSource: j,
  };
}

export function createHimalayasAdapter(): JobSource {
  return {
    id: "himalayas",
    displayName: "Himalayas (remote)",
    available: async () => ({ ok: true }),
    costEstimate: () => 0,
    search: async (params: SearchParams, signal: AbortSignal): Promise<RawJob[]> => {
      try {
        const limit = Math.min(Math.max(params.maxResults, 1), MAX_LIMIT);
        const res = await fetch(`${BASE}?limit=${limit}`, { signal, cache: "no-store" });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new SourceTransientError(`Himalayas ${res.status}: ${text || res.statusText}`);
        }
        const json = (await res.json()) as { jobs?: HmJob[] };
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
        classifyAtsError(err, "himalayas.search");
      }
    },
  };
}
