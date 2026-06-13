// Workable adapter — public account widget API, no auth required.
// Endpoint: https://apply.workable.com/api/v1/widget/accounts/{company}?details=true
//
// Pattern (mirrors greenhouse.ts): profile.sources includes "workable" AND
// params.targetCompanies is the list of Workable account slugs. Each account is
// fetched once; results are filtered by params.query / params.location post-fetch.
//
// See epic #111.

import { classifyAtsError, handleAtsHttpError, htmlToText, matchesLocation, matchesQuery } from "./ats-shared";
import { SourcePermanentError } from "./errors";
import type { JobSource, RawJob, RemoteMode, SearchParams } from "./types";

const BASE = "https://apply.workable.com/api/v1/widget/accounts";

interface WorkableJob {
  id?: number | string;
  shortcode?: string;
  title?: string;
  employment_type?: string;
  telecommuting?: boolean;
  department?: string;
  url?: string;
  application_url?: string;
  created_at?: string;
  country?: string;
  city?: string;
  region?: string;
  state?: string;
  location?: { city?: string; region?: string; country?: string };
  description?: string;
  requirements?: string;
  benefits?: string;
}

interface WorkableResponse {
  name?: string;
  description?: string;
  jobs?: WorkableJob[];
}

function locationRaw(j: WorkableJob): string | undefined {
  const parts = [
    j.city ?? j.location?.city,
    j.region ?? j.state ?? j.location?.region,
    j.country ?? j.location?.country,
  ].filter((s): s is string => !!s && s.length > 0);
  return parts.length ? parts.join(", ") : undefined;
}

function toRawJob(j: WorkableJob, company: string): RawJob | null {
  const id = j.shortcode || (j.id != null ? String(j.id) : "");
  if (!id || !j.title) return null;
  const url = j.url || j.application_url || "";
  if (!url) return null;

  const descriptionHtml = [j.description, j.requirements, j.benefits]
    .filter((s): s is string => !!s && s.length > 0)
    .join("\n\n");
  const description = descriptionHtml ? htmlToText(descriptionHtml) : "";

  const remoteMode: RemoteMode | undefined = j.telecommuting === true ? "remote" : undefined;

  return {
    externalId: `${company}-${id}`,
    title: j.title,
    company,
    location: { raw: locationRaw(j) },
    remoteMode,
    description,
    jobType: j.employment_type,
    postedAt: j.created_at,
    url,
    rawSource: j,
  };
}

export function createWorkableAdapter(): JobSource {
  return {
    id: "workable",
    displayName: "Workable (direct ATS)",
    available: async () => ({ ok: true }),
    costEstimate: () => 0,
    search: async (params: SearchParams, signal: AbortSignal): Promise<RawJob[]> => {
      const companies = params.targetCompanies ?? [];
      if (companies.length === 0) return [];

      const collected: RawJob[] = [];
      try {
        for (const company of companies) {
          if (signal.aborted) throw new SourcePermanentError("aborted between Workable accounts");
          const url = `${BASE}/${encodeURIComponent(company)}?details=true`;
          const res = await fetch(url, { signal, cache: "no-store" });

          if (!res.ok) {
            const text = await res.text().catch(() => "");
            if (handleAtsHttpError(res.status, text, res.statusText, "Workable") === "skip") continue;
          }

          const json = (await res.json()) as WorkableResponse;
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
        classifyAtsError(err, "workable.search");
      }
    },
  };
}
