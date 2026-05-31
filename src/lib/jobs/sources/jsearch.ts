// JSearch adapter — wraps the existing v2.4 JSearch client in the v3.0
// JobSource interface. The underlying client at @/lib/jsearch/client is
// untouched so v2.4 route handlers continue to work; this adapter is what the
// v3.0 scheduler invokes.
//
// See doc/plans/2026-05-31-rolehunter-v3-design.md §5.5 + §5.6.

import { getEnv } from "@/lib/env";
import { searchJobs as jsearchClient } from "@/lib/jsearch/client";
import type { JSearchJob } from "@/lib/jsearch/client";
import { SourcePermanentError, SourceTransientError, wrapUnknownError } from "./errors";
import type { JobSource, RawJob, SearchParams } from "./types";

const RESULTS_PER_PAGE = 10;

function isPermanent(message: string): boolean {
  return /\b(401|403|404)\b/.test(message);
}

function joinLocation(city: string | null, country: string | null): string | undefined {
  const parts = [city, country].filter(Boolean) as string[];
  return parts.length > 0 ? parts.join(", ") : undefined;
}

function toRawJob(j: JSearchJob): RawJob | null {
  if (!j.job_id || !j.job_title) return null;
  const salary =
    j.job_min_salary != null || j.job_max_salary != null
      ? {
          min: j.job_min_salary ?? undefined,
          max: j.job_max_salary ?? undefined,
          currency: j.job_salary_currency ?? "USD",
          period: "year" as const,
        }
      : undefined;
  return {
    externalId: j.job_id,
    title: j.job_title,
    company: j.employer_name ?? "",
    location: {
      city: j.job_city ?? undefined,
      country: j.job_country ?? undefined,
      raw: joinLocation(j.job_city, j.job_country),
    },
    description: j.job_description ?? "",
    salary,
    postedAt: j.job_posted_at_datetime_utc ?? undefined,
    url: j.job_apply_link ?? "",
    rawSource: j,
  };
}

async function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw new SourcePermanentError("aborted before start");
  return new Promise<T>((resolve, reject) => {
    const onAbort = () =>
      reject(new SourcePermanentError("aborted mid-flight (JSearch client does not yet thread AbortSignal)"));
    signal.addEventListener("abort", onAbort, { once: true });
    promise
      .then((v) => {
        signal.removeEventListener("abort", onAbort);
        resolve(v);
      })
      .catch((err) => {
        signal.removeEventListener("abort", onAbort);
        reject(err);
      });
  });
}

export function createJSearchAdapter(): JobSource {
  return {
    id: "jsearch",
    displayName: "JSearch (via RapidAPI)",
    available: async () => {
      const env = getEnv();
      if (!env.JSEARCH_RAPIDAPI_KEY) {
        return { ok: false, reason: "JSEARCH_RAPIDAPI_KEY not set" };
      }
      return { ok: true };
    },
    costEstimate: () => 0,
    search: async (params: SearchParams, signal: AbortSignal): Promise<RawJob[]> => {
      const pages = Math.max(1, Math.ceil(params.maxResults / RESULTS_PER_PAGE));
      try {
        const result = await abortable(
          jsearchClient(params.query, { page: 1, num_pages: pages }),
          signal,
        );
        const mapped: RawJob[] = [];
        for (const j of result.data) {
          const r = toRawJob(j);
          if (r) mapped.push(r);
        }
        return mapped.slice(0, params.maxResults);
      } catch (err) {
        if (err instanceof SourcePermanentError || err instanceof SourceTransientError) throw err;
        const msg = err instanceof Error ? err.message : String(err);
        if (isPermanent(msg)) throw new SourcePermanentError(msg, { cause: err });
        if (/network|timeout|ECONN|ETIMEDOUT|fetch failed/i.test(msg)) {
          throw new SourceTransientError(msg, { cause: err });
        }
        throw wrapUnknownError(err, "jsearch.search");
      }
    },
  };
}
