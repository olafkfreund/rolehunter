// LinkedIn-via-Fantastic-Jobs adapter — wraps the existing v2.4 LinkedIn client
// in the v3.0 JobSource interface. The underlying client at
// @/lib/linkedin/client is untouched.
//
// See doc/plans/2026-05-31-rolehunter-v3-design.md §5.5 + §5.6.

import { getEnv } from "@/lib/env";
import { searchJobs as linkedinClient } from "@/lib/linkedin/client";
import type { LinkedInJob } from "@/lib/linkedin/client";
import { SourcePermanentError, SourceTransientError, wrapUnknownError } from "./errors";
import type { JobSource, RawJob, SearchParams } from "./types";

const RESULTS_PER_PAGE = 20;

function isPermanent(message: string): boolean {
  return /\b(401|403|404)\b/.test(message);
}

function toRawJob(j: LinkedInJob): RawJob | null {
  if (!j.id || !j.title) return null;
  const salary =
    j.salaryMin != null || j.salaryMax != null
      ? {
          min: j.salaryMin ?? undefined,
          max: j.salaryMax ?? undefined,
          currency: j.salaryCurrency ?? "USD",
          period: "year" as const,
        }
      : undefined;
  return {
    externalId: j.id,
    title: j.title,
    company: j.company ?? "",
    location: { raw: j.location || undefined },
    remoteMode: j.isRemote ? "remote" : undefined,
    description: j.description ?? "",
    salary,
    postedAt: j.listedAt ?? undefined,
    url: j.url ?? "",
    rawSource: j.raw,
  };
}

async function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw new SourcePermanentError("aborted before start");
  return new Promise<T>((resolve, reject) => {
    const onAbort = () =>
      reject(new SourcePermanentError("aborted mid-flight (LinkedIn client uses its own 30s timeout)"));
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

export function createLinkedInAdapter(): JobSource {
  return {
    id: "linkedin",
    displayName: "LinkedIn (via Fantastic Jobs / RapidAPI)",
    available: async () => {
      const env = getEnv();
      if (!env.JSEARCH_RAPIDAPI_KEY) {
        return { ok: false, reason: "JSEARCH_RAPIDAPI_KEY not set (shared with JSearch)" };
      }
      if (!env.LINKEDIN_RAPIDAPI_HOST) {
        return { ok: false, reason: "LINKEDIN_RAPIDAPI_HOST not set" };
      }
      return { ok: true };
    },
    costEstimate: () => 0,
    search: async (params: SearchParams, signal: AbortSignal): Promise<RawJob[]> => {
      const limit = Math.min(params.maxResults, RESULTS_PER_PAGE);
      try {
        const result = await abortable(
          linkedinClient(params.query, {
            location: params.location,
            limit,
            offset: 0,
          }),
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
        if (/network|timeout|ECONN|ETIMEDOUT|fetch failed|aborted/i.test(msg)) {
          throw new SourceTransientError(msg, { cause: err });
        }
        throw wrapUnknownError(err, "linkedin.search");
      }
    },
  };
}
