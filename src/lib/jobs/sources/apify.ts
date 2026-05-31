// Apify adapter — on-demand actor runs against the Apify HTTP API.
//
// Apify hosts ~12 LinkedIn job scrapers, ~7 Glassdoor scrapers, and a
// LinkedIn Company Scraper used by future v3.2 enrichment. This adapter wraps
// the run-actor-and-poll-for-results flow.
//
// Cost: each actor run is paid per-Apify-pricing (varies, typically
// $0.01-0.30). We track via the source_budgets table; BUDGET_APIFY_USD_MONTHLY
// caps spend. Fail-open: when cap exceeded, returns the empty result and the
// scheduler marks the run skipped_budget cleanly.
//
// See doc/plans/2026-05-31-rolehunter-v3-design.md §5.5 + §9.3.

import { getEnv } from "@/lib/env";
import { SourcePermanentError, SourceTransientError, wrapUnknownError } from "./errors";
import type { JobSource, RawJob, SearchParams } from "./types";

const APIFY_BASE = "https://api.apify.com/v2";
const POLL_INTERVAL_MS = 3_000;
const MAX_POLL_MS = 90_000; // most actor runs finish within 30-90s

interface ApifyRunResponse {
  data: {
    id: string;
    actId: string;
    status:
      | "READY"
      | "RUNNING"
      | "SUCCEEDED"
      | "FAILED"
      | "TIMING-OUT"
      | "TIMED-OUT"
      | "ABORTING"
      | "ABORTED";
    defaultDatasetId: string;
    startedAt?: string;
    finishedAt?: string;
  };
}

interface ApifyItemRaw {
  // LinkedIn Jobs Scraper canonical fields (varies by actor; we accept the
  // common shape and degrade gracefully on missing fields):
  id?: string;
  jobUrl?: string;
  link?: string;
  url?: string;
  jobTitle?: string;
  title?: string;
  companyName?: string;
  company?: string;
  location?: string;
  description?: string;
  descriptionText?: string;
  postedAt?: string;
  postedDate?: string;
  publishedAt?: string;
  salary?: { min?: number; max?: number; currency?: string };
  salaryMin?: number;
  salaryMax?: number;
  currency?: string;
  isRemote?: boolean;
  remote?: boolean;
  [key: string]: unknown;
}

function pickStr(...candidates: (string | undefined)[]): string | undefined {
  for (const c of candidates) {
    if (typeof c === "string" && c.length > 0) return c;
  }
  return undefined;
}

function toRawJob(it: ApifyItemRaw): RawJob | null {
  const url = pickStr(it.jobUrl, it.url, it.link);
  const title = pickStr(it.jobTitle, it.title);
  if (!title || !url) return null;
  const company = pickStr(it.companyName, it.company) ?? "";
  const description = pickStr(it.descriptionText, it.description) ?? "";
  const externalId = pickStr(it.id, url);
  if (!externalId) return null;

  const salaryMin = it.salaryMin ?? it.salary?.min;
  const salaryMax = it.salaryMax ?? it.salary?.max;
  const currency = it.currency ?? it.salary?.currency ?? "USD";
  const salary =
    salaryMin != null || salaryMax != null
      ? {
          min: salaryMin ?? undefined,
          max: salaryMax ?? undefined,
          currency,
          period: "year" as const,
        }
      : undefined;

  const remoteSignal = it.isRemote ?? it.remote;
  const remoteMode: RawJob["remoteMode"] = remoteSignal === true ? "remote" : undefined;

  return {
    externalId,
    title,
    company,
    location: { raw: typeof it.location === "string" ? it.location : undefined },
    remoteMode,
    description,
    salary,
    postedAt: pickStr(it.postedAt, it.postedDate, it.publishedAt),
    url,
    rawSource: it,
  };
}

async function startActorRun(
  actorId: string,
  input: Record<string, unknown>,
  token: string,
  signal: AbortSignal,
): Promise<ApifyRunResponse["data"]> {
  const url = `${APIFY_BASE}/acts/${encodeURIComponent(actorId)}/runs?token=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) {
      throw new SourcePermanentError(`Apify auth failed (${res.status}): ${text}`);
    }
    if (res.status === 404) {
      throw new SourcePermanentError(`Apify actor '${actorId}' not found`);
    }
    throw new SourceTransientError(`Apify start run ${res.status}: ${text || res.statusText}`);
  }
  const json = (await res.json()) as ApifyRunResponse;
  return json.data;
}

async function pollUntilFinished(
  runId: string,
  token: string,
  signal: AbortSignal,
): Promise<ApifyRunResponse["data"]> {
  const deadline = Date.now() + MAX_POLL_MS;
  while (Date.now() < deadline) {
    if (signal.aborted) throw new SourcePermanentError("aborted while polling Apify run");
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const url = `${APIFY_BASE}/actor-runs/${encodeURIComponent(runId)}?token=${encodeURIComponent(token)}`;
    const res = await fetch(url, { signal });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new SourceTransientError(`Apify poll ${res.status}: ${text || res.statusText}`);
    }
    const json = (await res.json()) as ApifyRunResponse;
    if (
      json.data.status === "SUCCEEDED" ||
      json.data.status === "FAILED" ||
      json.data.status === "TIMED-OUT" ||
      json.data.status === "ABORTED"
    ) {
      return json.data;
    }
  }
  throw new SourceTransientError(`Apify run did not finish within ${MAX_POLL_MS}ms`);
}

async function fetchDatasetItems(
  datasetId: string,
  token: string,
  signal: AbortSignal,
  limit: number,
): Promise<ApifyItemRaw[]> {
  const url = `${APIFY_BASE}/datasets/${encodeURIComponent(datasetId)}/items?token=${encodeURIComponent(token)}&format=json&limit=${limit}`;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new SourceTransientError(`Apify dataset ${res.status}: ${text || res.statusText}`);
  }
  const items = (await res.json()) as unknown;
  return Array.isArray(items) ? (items as ApifyItemRaw[]) : [];
}

export function createApifyAdapter(): JobSource {
  return {
    id: "apify",
    displayName: "Apify (LinkedIn + Glassdoor on-demand)",
    available: async () => {
      const env = getEnv();
      if (!env.APIFY_API_TOKEN) {
        return { ok: false, reason: "APIFY_API_TOKEN not set" };
      }
      if (!env.APIFY_LINKEDIN_ACTOR_ID) {
        return { ok: false, reason: "APIFY_LINKEDIN_ACTOR_ID not set" };
      }
      return { ok: true };
    },
    costEstimate: () => {
      // Per-run estimate; the source_budgets monthly cap is what really
      // matters. Conservative default ~$0.05 (typical LI scraper).
      const env = getEnv();
      const raw = env.APIFY_USD_PER_RUN_ESTIMATE;
      const n = raw ? Number(raw) : NaN;
      return Number.isFinite(n) && n > 0 ? n : 0.05;
    },
    search: async (params: SearchParams, signal: AbortSignal): Promise<RawJob[]> => {
      const env = getEnv();
      const token = env.APIFY_API_TOKEN;
      const actorId = env.APIFY_LINKEDIN_ACTOR_ID;
      if (!token || !actorId) {
        throw new SourcePermanentError("Apify not configured (APIFY_API_TOKEN / APIFY_LINKEDIN_ACTOR_ID)");
      }

      try {
        // Actor-input shape varies per actor — send the union of common fields.
        // Most LI scrapers accept these; extras are ignored. For url-based
        // actors (e.g. curious_coder/linkedin-jobs-scraper) we synthesize a
        // LinkedIn jobs search URL from query+location+remote.
        const synthesizedUrl = (() => {
          const sp = new URLSearchParams();
          sp.set("keywords", params.query);
          if (params.location) sp.set("location", params.location);
          if (params.remoteModes?.includes("remote") && !params.remoteModes?.includes("hybrid")) {
            // f_WT=2 means Remote on LinkedIn's search filter
            sp.set("f_WT", "2");
          }
          return `https://www.linkedin.com/jobs/search/?${sp.toString()}`;
        })();

        const input: Record<string, unknown> = {
          // url-based shape (curious_coder, valig, etc.)
          urls: [synthesizedUrl],
          // keyword-based shape (bebity etc.)
          searchKeywords: params.query,
          keywords: params.query,
          // shared
          location: params.location,
          isRemote: params.remoteModes?.includes("remote") ? true : undefined,
          rows: params.maxResults,
          count: params.maxResults,
          maxItems: params.maxResults,
        };

        const run = await startActorRun(actorId, input, token, signal);
        const finished = await pollUntilFinished(run.id, token, signal);
        if (finished.status !== "SUCCEEDED") {
          throw new SourceTransientError(`Apify run ended with status ${finished.status}`);
        }
        const items = await fetchDatasetItems(
          finished.defaultDatasetId,
          token,
          signal,
          params.maxResults,
        );
        const mapped: RawJob[] = [];
        for (const it of items) {
          const raw = toRawJob(it);
          if (raw) mapped.push(raw);
          if (mapped.length >= params.maxResults) break;
        }
        return mapped;
      } catch (err) {
        if (err instanceof SourcePermanentError || err instanceof SourceTransientError) throw err;
        const msg = err instanceof Error ? err.message : String(err);
        if (/aborted/i.test(msg)) throw new SourcePermanentError(msg, { cause: err });
        if (/network|timeout|ECONN|ETIMEDOUT|fetch failed/i.test(msg)) {
          throw new SourceTransientError(msg, { cause: err });
        }
        throw wrapUnknownError(err, "apify.search");
      }
    },
  };
}
