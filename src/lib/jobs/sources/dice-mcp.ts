// Dice (MCP) adapter — same shape as indeed-mcp but pointed at Dice's MCP server.
//
// Configuration (env-driven):
//   DICE_MCP_TRANSPORT=http|stdio
//   DICE_MCP_URL=https://...                      (http only)
//   DICE_MCP_TOKEN=...                             (http, optional)
//   DICE_MCP_CMD=...                                (stdio only)
//   DICE_MCP_ARGS=...                               (stdio args)
//   DICE_MCP_SEARCH_TOOL=search_jobs                (override tool name if needed)
//
// Dice is US tech-only. countryHint is ignored; setting it to non-US returns [].
//
// See doc/plans/2026-05-31-rolehunter-v3-design.md §5.5.

import { extractMcpText, getMcpClient, readMcpConfigFromEnv, tryParseJson } from "./mcp-base";
import { SourcePermanentError, SourceTransientError, wrapUnknownError } from "./errors";
import type { JobSource, RawJob, SearchParams } from "./types";

const TOOL_NAME = process.env.DICE_MCP_SEARCH_TOOL ?? "search_jobs";

interface DiceJob {
  id?: string;
  job_id?: string;
  title?: string;
  company?: string;
  company_name?: string;
  location?: string;
  description?: string;
  detail_url?: string;
  url?: string;
  posted_date?: string;
  date?: string;
  employment_type?: string;
  salary?: string;
  salary_min?: number;
  salary_max?: number;
}

function pick(...vals: (string | undefined)[]): string | undefined {
  for (const v of vals) if (typeof v === "string" && v.length > 0) return v;
  return undefined;
}

function toRawJob(j: DiceJob): RawJob | null {
  const url = pick(j.detail_url, j.url);
  const externalId = pick(j.id, j.job_id, url);
  if (!j.title || !url || !externalId) return null;

  const salary =
    j.salary_min != null || j.salary_max != null
      ? {
          min: j.salary_min ?? undefined,
          max: j.salary_max ?? undefined,
          currency: "USD",
          period: "year" as const,
        }
      : undefined;

  return {
    externalId,
    title: j.title,
    company: pick(j.company, j.company_name) ?? "",
    location: j.location ? { raw: j.location } : undefined,
    description: j.description ?? "",
    salary,
    jobType: j.employment_type,
    postedAt: pick(j.posted_date, j.date),
    url,
    rawSource: j,
  };
}

export function createDiceMcpAdapter(): JobSource {
  return {
    id: "dice",
    displayName: "Dice (MCP — US tech roles)",
    available: async () => {
      const config = readMcpConfigFromEnv("DICE_MCP");
      if (!config) {
        return {
          ok: false,
          reason:
            "DICE_MCP_TRANSPORT not set (or required URL/CMD missing). Configure http or stdio transport to enable.",
        };
      }
      return { ok: true };
    },
    costEstimate: () => 0,
    search: async (params: SearchParams, signal: AbortSignal): Promise<RawJob[]> => {
      const config = readMcpConfigFromEnv("DICE_MCP");
      if (!config) throw new SourcePermanentError("Dice MCP not configured");
      if (signal.aborted) throw new SourcePermanentError("aborted before MCP call");

      // Dice is US-only — short-circuit if explicitly non-US
      const country = (params.countryHint ?? "us").toLowerCase();
      if (country !== "us" && country !== "usa") {
        return [];
      }

      try {
        const client = await getMcpClient("dice", config);

        const callPromise = client.callTool({
          name: TOOL_NAME,
          arguments: {
            query: params.query,
            keywords: params.query,
            location: params.location,
            limit: params.maxResults,
            num_results: params.maxResults,
          } as Record<string, unknown>,
        });

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
        const items: DiceJob[] = (() => {
          if (Array.isArray(parsed)) return parsed as DiceJob[];
          if (parsed && typeof parsed === "object") {
            const p = parsed as { jobs?: DiceJob[]; results?: DiceJob[]; data?: DiceJob[] };
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
          throw new SourcePermanentError(`Dice MCP auth: ${msg}`, { cause: err });
        }
        if (/network|timeout|ECONN|ETIMEDOUT|fetch failed|ENOTFOUND/i.test(msg)) {
          throw new SourceTransientError(msg, { cause: err });
        }
        throw wrapUnknownError(err, "dice-mcp.search");
      }
    },
  };
}
