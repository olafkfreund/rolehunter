// Ashby adapter — public job-board posting API, no auth required.
// Endpoint: https://api.ashbyhq.com/posting-api/job-board/{company}?includeCompensation=true
//
// Pattern (mirrors greenhouse.ts): profile.sources includes "ashby" AND
// params.targetCompanies is the list of Ashby job-board names. Each board is
// fetched once; results are filtered by params.query / params.location post-fetch.
//
// See epic #111.

import { classifyAtsError, handleAtsHttpError, htmlToText, matchesLocation, matchesQuery } from "./ats-shared";
import { SourcePermanentError } from "./errors";
import type { JobSource, RawJob, RemoteMode, SearchParams } from "./types";

const BASE = "https://api.ashbyhq.com/posting-api/job-board";

interface AshbyJob {
  id?: string;
  title?: string;
  department?: string;
  team?: string;
  employmentType?: string;
  location?: string;
  publishedAt?: string;
  isListed?: boolean;
  isRemote?: boolean;
  workplaceType?: string;
  jobUrl?: string;
  applyUrl?: string;
  descriptionHtml?: string;
  descriptionPlain?: string;
}

interface AshbyResponse {
  jobs?: AshbyJob[];
  apiVersion?: string;
}

function remoteModeFrom(j: AshbyJob): RemoteMode | undefined {
  const wt = j.workplaceType?.toLowerCase();
  if (wt === "remote") return "remote";
  if (wt === "hybrid") return "hybrid";
  if (wt === "onsite" || wt === "on-site" || wt === "in-office") return "onsite";
  if (j.isRemote === true) return "remote";
  return undefined;
}

function toRawJob(j: AshbyJob, company: string): RawJob | null {
  if (!j.id || !j.title) return null;
  const url = j.jobUrl || j.applyUrl || "";
  if (!url) return null;

  const description =
    j.descriptionPlain && j.descriptionPlain.trim().length > 0
      ? j.descriptionPlain
      : htmlToText(j.descriptionHtml ?? "");

  return {
    externalId: `${company}-${j.id}`,
    title: j.title,
    company,
    location: { raw: j.location || undefined },
    remoteMode: remoteModeFrom(j),
    description,
    jobType: j.employmentType,
    postedAt: j.publishedAt,
    url,
    rawSource: j,
  };
}

export function createAshbyAdapter(): JobSource {
  return {
    id: "ashby",
    displayName: "Ashby (direct ATS)",
    available: async () => ({ ok: true }),
    costEstimate: () => 0,
    search: async (params: SearchParams, signal: AbortSignal): Promise<RawJob[]> => {
      const companies = params.targetCompanies ?? [];
      if (companies.length === 0) return [];

      const collected: RawJob[] = [];
      try {
        for (const company of companies) {
          if (signal.aborted) throw new SourcePermanentError("aborted between Ashby boards");
          const url = `${BASE}/${encodeURIComponent(company)}?includeCompensation=true`;
          const res = await fetch(url, { signal, cache: "no-store" });

          if (!res.ok) {
            const text = await res.text().catch(() => "");
            if (handleAtsHttpError(res.status, text, res.statusText, "Ashby") === "skip") continue;
          }

          const json = (await res.json()) as AshbyResponse;
          for (const j of json.jobs ?? []) {
            if (j.isListed === false) continue;
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
        classifyAtsError(err, "ashby.search");
      }
    },
  };
}
