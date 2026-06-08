// Reed.co.uk UK job board adapter — direct REST against https://www.reed.co.uk/api/1.0/search.
// Free developer tier, requires REED_API_KEY.
// See doc/plans/2026-05-31-rolehunter-v3-design.md.

import { getEnv } from "@/lib/env";
import { SourcePermanentError, SourceTransientError, wrapUnknownError } from "./errors";
import type { JobSource, RawJob, SearchParams } from "./types";

interface ReedJob {
  jobId: number;
  employerId: number;
  employerName: string;
  jobTitle: string;
  locationName: string;
  minimumSalary?: number;
  maximumSalary?: number;
  currency: string;
  expirationDate: string;
  date: string;
  jobDescription: string;
  jobUrl: string;
}

interface ReedResponse {
  results?: ReedJob[];
  totalResults?: number;
}

function toRawJob(j: ReedJob): RawJob | null {
  if (!j.jobId || !j.jobTitle || !j.jobDescription || !j.jobUrl) return null;

  const salary =
    j.minimumSalary != null || j.maximumSalary != null
      ? {
          min: j.minimumSalary ?? undefined,
          max: j.maximumSalary ?? undefined,
          currency: j.currency || "GBP",
          period: "year" as const,
        }
      : undefined;

  return {
    externalId: `reed-${j.jobId}`,
    title: j.jobTitle,
    company: j.employerName || "",
    location: { raw: j.locationName },
    description: j.jobDescription,
    salary,
    postedAt: j.date,
    url: j.jobUrl,
    rawSource: j,
  };
}

export function createReedAdapter(): JobSource {
  return {
    id: "reed",
    displayName: "Reed.co.uk",
    available: async () => {
      const env = getEnv();
      if (!env.REED_API_KEY) {
        return { ok: false, reason: "REED_API_KEY not set" };
      }
      return { ok: true };
    },
    costEstimate: () => 0, // Free developer API
    search: async (params: SearchParams, signal: AbortSignal): Promise<RawJob[]> => {
      const env = getEnv();
      const apiKey = env.REED_API_KEY;
      if (!apiKey) {
        throw new SourcePermanentError("Reed not configured (REED_API_KEY)");
      }

      try {
        const sp = new URLSearchParams({
          keywords: params.query,
        });
        if (params.location) {
          sp.set("locationName", params.location);
        }
        sp.set("limit", String(params.maxResults || 20));

        // Authenticate with Reed using Basic Auth (API key as username, empty password)
        const authHeader = `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;

        const res = await fetch(`https://www.reed.co.uk/api/1.0/search?${sp.toString()}`, {
          signal,
          headers: {
            Authorization: authHeader,
            Accept: "application/json",
          },
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          if (res.status === 401 || res.status === 403) {
            throw new SourcePermanentError(`Reed API auth failed (${res.status}): ${text}`);
          }
          throw new SourceTransientError(`Reed API ${res.status}: ${text || res.statusText}`);
        }

        const data = (await res.json()) as ReedResponse;
        const results = data.results || [];
        const mapped: RawJob[] = [];
        for (const r of results) {
          const raw = toRawJob(r);
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
        throw wrapUnknownError(err, "reed.search");
      }
    },
  };
}
