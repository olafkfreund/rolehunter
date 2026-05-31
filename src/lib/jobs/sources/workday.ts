// Workday adapter — uses the hidden JSON endpoint that backs
// *.myworkdayjobs.com career sites.
//
// Endpoint shape:
//   POST https://{tenant}.{wd}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs
//
// targetCompanies entries use the format "{tenant}/{site}" (or
// "{tenant}/{site}/{wd}" if the wd subdomain isn't wd5). Examples:
//   "stripe/External"
//   "nvidia/NVIDIAExternalCareerSite/wd5"
//
// Body shape (minimal):
//   { "appliedFacets": {}, "limit": 20, "offset": 0, "searchText": "..." }
//
// Some Workday instances are "protected" — they require a browser session
// (cookies, csrf token). For those, this adapter returns
// SourcePermanentError with a helpful reason.
//
// See doc/plans/2026-05-31-rolehunter-v3-design.md §5.5.

import { SourcePermanentError, SourceTransientError, wrapUnknownError } from "./errors";
import type { JobSource, RawJob, SearchParams } from "./types";

const DEFAULT_WD_SUBDOMAIN = "wd5";
const RESULTS_PER_PAGE = 20;

interface WdLocation {
  descriptor?: string;
  country?: { descriptor?: string };
}

interface WdJob {
  title?: string;
  externalPath?: string;
  bulletFields?: string[];
  locationsText?: string;
  postedOn?: string;
  jobRequisitionLocation?: WdLocation;
  jobPostingId?: string;
}

interface WdResponse {
  jobPostings?: WdJob[];
  total?: number;
}

function parseTarget(target: string): { tenant: string; site: string; subdomain: string } | null {
  // Accept "tenant/site" or "tenant/site/subdomain"
  const parts = target.split("/").map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  return {
    tenant: parts[0],
    site: parts[1],
    subdomain: parts[2] ?? DEFAULT_WD_SUBDOMAIN,
  };
}

function buildJobUrl(tenant: string, subdomain: string, externalPath: string): string {
  // externalPath usually looks like: /en-US/CompanyExternalCareerSite/job/Location/Title_R-12345
  return `https://${tenant}.${subdomain}.myworkdayjobs.com${externalPath}`;
}

function toRawJob(j: WdJob, tenant: string, subdomain: string): RawJob | null {
  if (!j.title || !j.externalPath) return null;
  const url = buildJobUrl(tenant, subdomain, j.externalPath);
  const locationDescriptor = j.jobRequisitionLocation?.descriptor ?? j.locationsText;
  return {
    externalId: j.jobPostingId ?? j.externalPath,
    title: j.title,
    company: tenant,
    location: { raw: locationDescriptor },
    description: (j.bulletFields ?? []).join("\n"),
    postedAt: j.postedOn,
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

export function createWorkdayAdapter(): JobSource {
  return {
    id: "workday",
    displayName: "Workday (direct ATS via hidden JSON)",
    available: async () => ({ ok: true }),
    costEstimate: () => 0,
    search: async (params: SearchParams, signal: AbortSignal): Promise<RawJob[]> => {
      const targets = params.targetCompanies ?? [];
      if (targets.length === 0) return [];

      const collected: RawJob[] = [];

      try {
        for (const targetSpec of targets) {
          if (signal.aborted) {
            throw new SourcePermanentError("aborted between Workday boards");
          }
          const parsed = parseTarget(targetSpec);
          if (!parsed) {
            // Malformed target — skip rather than fail the whole call.
            continue;
          }
          const { tenant, site, subdomain } = parsed;

          // Page through results
          let offset = 0;
          while (offset < params.maxResults * 2 /* room for filtering */) {
            const endpoint = `https://${tenant}.${subdomain}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`;
            const res = await fetch(endpoint, {
              method: "POST",
              signal,
              cache: "no-store",
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                "User-Agent":
                  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
              },
              body: JSON.stringify({
                appliedFacets: {},
                limit: RESULTS_PER_PAGE,
                offset,
                searchText: params.query,
              }),
            });

            if (!res.ok) {
              const text = await res.text().catch(() => "");
              if (res.status === 404) break;
              if (res.status === 401 || res.status === 403) {
                throw new SourcePermanentError(
                  `Workday board '${targetSpec}' requires browser session (${res.status}). Skip this tenant or wire authenticated session in a follow-up.`,
                );
              }
              if (res.status === 405) {
                throw new SourcePermanentError(
                  `Workday board '${targetSpec}' rejected POST — probably not a standard ATS site (${res.status})`,
                );
              }
              throw new SourceTransientError(`Workday ${res.status}: ${text || res.statusText}`);
            }

            const json = (await res.json()) as WdResponse;
            const rows = json.jobPostings ?? [];
            if (rows.length === 0) break;

            for (const j of rows) {
              const raw = toRawJob(j, tenant, subdomain);
              if (!raw) continue;
              if (!matchesQuery(raw, params.query)) continue;
              collected.push(raw);
              if (collected.length >= params.maxResults) break;
            }

            if (collected.length >= params.maxResults) break;
            if (rows.length < RESULTS_PER_PAGE) break;
            offset += RESULTS_PER_PAGE;
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
        throw wrapUnknownError(err, "workday.search");
      }
    },
  };
}
