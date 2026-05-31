// Indeed (official MCP) adapter — wraps Indeed's MCP server.
//
// Configuration (env-driven):
//   INDEED_MCP_TRANSPORT=http|stdio
//   INDEED_MCP_URL=https://...                   (http only)
//   INDEED_MCP_TOKEN=...                          (http, optional)
//   INDEED_MCP_CMD=indeed-mcp                     (stdio only — binary to spawn)
//   INDEED_MCP_ARGS=...                           (stdio args, space-separated)
//
// Tools (per docs.indeed.com/mcp):
//   job_search    — query Indeed jobs by keyword/location/country
//   job_detail    — fetch a specific job posting's full content
//   get_resume    — retrieve the account holder's Indeed resume (not used)
//
// See doc/plans/2026-05-31-rolehunter-v3-design.md §5.5.

import { extractMcpText, getMcpClient, readMcpConfigFromEnv, tryParseJson } from "./mcp-base";
import { SourcePermanentError, SourceTransientError, wrapUnknownError } from "./errors";
import type { JobSource, RawJob, SearchParams } from "./types";

const TOOL_NAME = process.env.INDEED_MCP_SEARCH_TOOL ?? "job_search";

interface IndeedJob {
  id?: string;
  job_id?: string;
  title?: string;
  job_title?: string;
  company?: string;
  employer_name?: string;
  location?: string;
  job_city?: string;
  job_country?: string;
  description?: string;
  job_description?: string;
  url?: string;
  apply_url?: string;
  job_apply_link?: string;
  posted_at?: string;
  date_posted?: string;
  salary_min?: number;
  salary_max?: number;
  salary_currency?: string;
}

function pick(...vals: (string | undefined)[]): string | undefined {
  for (const v of vals) if (typeof v === "string" && v.length > 0) return v;
  return undefined;
}

function toRawJob(j: IndeedJob): RawJob | null {
  const url = pick(j.url, j.apply_url, j.job_apply_link);
  const title = pick(j.title, j.job_title);
  const externalId = pick(j.id, j.job_id, url);
  if (!title || !url || !externalId) return null;

  const locationStr = pick(j.location, [j.job_city, j.job_country].filter(Boolean).join(", "));
  const description = pick(j.description, j.job_description) ?? "";

  const salary =
    j.salary_min != null || j.salary_max != null
      ? {
          min: j.salary_min ?? undefined,
          max: j.salary_max ?? undefined,
          currency: j.salary_currency ?? "USD",
          period: "year" as const,
        }
      : undefined;

  return {
    externalId,
    title,
    company: pick(j.company, j.employer_name) ?? "",
    location: locationStr ? { raw: locationStr } : undefined,
    description,
    salary,
    postedAt: pick(j.posted_at, j.date_posted),
    url,
    rawSource: j,
  };
}

export function createIndeedMcpAdapter(): JobSource {
  return {
    id: "indeed",
    displayName: "Indeed (official MCP)",
    available: async () => {
      const config = readMcpConfigFromEnv("INDEED_MCP");
      if (!config) {
        return {
          ok: false,
          reason:
            "INDEED_MCP_TRANSPORT not set (or required URL/CMD missing). Configure http or stdio transport to enable.",
        };
      }
      return { ok: true };
    },
    costEstimate: () => 0,
    search: async (params: SearchParams, signal: AbortSignal): Promise<RawJob[]> => {
      const config = readMcpConfigFromEnv("INDEED_MCP");
      if (!config) throw new SourcePermanentError("Indeed MCP not configured");
      if (signal.aborted) throw new SourcePermanentError("aborted before MCP call");

      try {
        const client = await getMcpClient("indeed", config);

        const callPromise = client.callTool({
          name: TOOL_NAME,
          arguments: {
            query: params.query,
            location: params.location,
            country: params.countryHint ?? "us",
            limit: params.maxResults,
            // Some implementations expect these alternative names
            search: params.query,
            num_results: params.maxResults,
          } as Record<string, unknown>,
        });

        // Race the call against abort
        const result = (await new Promise<unknown>((resolve, reject) => {
          const onAbort = () => reject(new SourcePermanentError("aborted mid-MCP call"));
          signal.addEventListener("abort", onAbort, { once: true });
          callPromise
            .then((v) => {
              signal.removeEventListener("abort", onAbort);
              resolve(v);
            })
            .catch((e) => {
              signal.removeEventListener("abort", onAbort);
              reject(e);
            });
        })) as unknown;

        const text = extractMcpText(result);
        const parsed = tryParseJson<unknown>(text);
        const items: IndeedJob[] = (() => {
          if (Array.isArray(parsed)) return parsed as IndeedJob[];
          if (parsed && typeof parsed === "object") {
            const p = parsed as { jobs?: IndeedJob[]; results?: IndeedJob[]; data?: IndeedJob[] };
            return p.jobs ?? p.results ?? p.data ?? [];
          }
          return [];
        })();

        const mapped: RawJob[] = [];
        for (const j of items) {
          const raw = toRawJob(j);
          if (raw) mapped.push(raw);
          if (mapped.length >= params.maxResults) break;
        }
        return mapped;
      } catch (err) {
        if (err instanceof SourcePermanentError || err instanceof SourceTransientError) throw err;
        const msg = err instanceof Error ? err.message : String(err);
        if (/aborted/i.test(msg)) throw new SourcePermanentError(msg, { cause: err });
        if (/auth|401|403|forbidden|unauthorized/i.test(msg)) {
          throw new SourcePermanentError(`Indeed MCP auth: ${msg}`, { cause: err });
        }
        if (/network|timeout|ECONN|ETIMEDOUT|fetch failed|ENOTFOUND/i.test(msg)) {
          throw new SourceTransientError(msg, { cause: err });
        }
        throw wrapUnknownError(err, "indeed-mcp.search");
      }
    },
  };
}
