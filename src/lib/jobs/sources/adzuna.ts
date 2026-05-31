// Adzuna adapter — direct REST against https://api.adzuna.com.
// Free dev tier: 250 calls/day, tracked via source_quotas_daily.
// 16 countries supported; user picks default via ADZUNA_DEFAULT_COUNTRY.
//
// See doc/plans/2026-05-31-rolehunter-v3-design.md §5.5.

import { getEnv } from "@/lib/env";
import { SourcePermanentError, SourceTransientError, wrapUnknownError } from "./errors";
import type { JobSource, RawJob, SearchParams } from "./types";

const RESULTS_PER_PAGE = 50; // Adzuna's documented max per call
const ADZUNA_BASE = "https://api.adzuna.com/v1/api/jobs";

// Per-country default currency for salary annotation. Adzuna salaries are
// usually annualized in the country's primary currency.
const COUNTRY_CURRENCY: Record<string, string> = {
  gb: "GBP",
  us: "USD",
  au: "AUD",
  br: "BRL",
  ca: "CAD",
  de: "EUR",
  fr: "EUR",
  in: "INR",
  it: "EUR",
  mx: "MXN",
  nl: "EUR",
  nz: "NZD",
  pl: "PLN",
  ru: "RUB",
  sg: "SGD",
  za: "ZAR",
};

interface AdzunaArea {
  area?: string[];
  display_name?: string;
}

interface AdzunaCompany {
  display_name?: string;
}

interface AdzunaJob {
  id: string | number;
  title: string;
  location?: AdzunaArea;
  salary_min?: number;
  salary_max?: number;
  contract_time?: string;
  contract_type?: string;
  company?: AdzunaCompany;
  description: string;
  redirect_url: string;
  created: string;
  category?: { label?: string };
}

interface AdzunaResponse {
  count?: number;
  results?: AdzunaJob[];
}

function toRawJob(j: AdzunaJob, country: string): RawJob | null {
  if (!j.id || !j.title || !j.description || !j.redirect_url) return null;

  const currency = COUNTRY_CURRENCY[country] ?? "USD";
  const salary =
    j.salary_min != null || j.salary_max != null
      ? {
          min: j.salary_min ?? undefined,
          max: j.salary_max ?? undefined,
          currency,
          period: "year" as const,
        }
      : undefined;

  const areas = j.location?.area ?? [];
  // Adzuna's area is ordered country -> region -> ... -> city
  const cityCandidate = areas.length > 1 ? areas[areas.length - 1] : undefined;
  const countryCandidate = areas[0];

  return {
    externalId: String(j.id),
    title: j.title,
    company: j.company?.display_name ?? "",
    location: {
      city: cityCandidate,
      country: countryCandidate,
      raw: j.location?.display_name,
    },
    description: j.description,
    salary,
    jobType: j.contract_time,
    postedAt: j.created,
    url: j.redirect_url,
    rawSource: j,
  };
}

export function createAdzunaAdapter(): JobSource {
  return {
    id: "adzuna",
    displayName: "Adzuna",
    available: async () => {
      const env = getEnv();
      if (!env.ADZUNA_APP_ID) return { ok: false, reason: "ADZUNA_APP_ID not set" };
      if (!env.ADZUNA_APP_KEY) return { ok: false, reason: "ADZUNA_APP_KEY not set" };
      return { ok: true };
    },
    costEstimate: () => 0, // free tier; daily-call quota enforcement via source_quotas_daily
    search: async (params: SearchParams, signal: AbortSignal): Promise<RawJob[]> => {
      const env = getEnv();
      const country = (params.countryHint ?? env.ADZUNA_DEFAULT_COUNTRY).toLowerCase();
      const pages = Math.max(1, Math.ceil(params.maxResults / RESULTS_PER_PAGE));

      const collected: RawJob[] = [];

      try {
        for (let page = 1; page <= pages; page++) {
          if (signal.aborted) {
            throw new SourcePermanentError("aborted between Adzuna pages");
          }

          const url = new URL(`${ADZUNA_BASE}/${country}/search/${page}`);
          url.searchParams.set("app_id", env.ADZUNA_APP_ID);
          url.searchParams.set("app_key", env.ADZUNA_APP_KEY);
          url.searchParams.set("what", params.query);
          url.searchParams.set("results_per_page", String(RESULTS_PER_PAGE));
          if (params.location) url.searchParams.set("where", params.location);
          if (params.salaryMinUsd) url.searchParams.set("salary_min", String(params.salaryMinUsd));
          if (params.salaryMaxUsd) url.searchParams.set("salary_max", String(params.salaryMaxUsd));

          const res = await fetch(url.toString(), {
            method: "GET",
            signal,
            cache: "no-store",
          });

          if (!res.ok) {
            const text = await res.text().catch(() => "");
            if (res.status === 401 || res.status === 403) {
              throw new SourcePermanentError(`Adzuna auth failed (${res.status}): ${text}`);
            }
            if (res.status === 404) {
              throw new SourcePermanentError(
                `Adzuna 404 — check ADZUNA_DEFAULT_COUNTRY='${country}' is supported`,
              );
            }
            throw new SourceTransientError(`Adzuna HTTP ${res.status}: ${text || res.statusText}`);
          }

          const json = (await res.json()) as AdzunaResponse;
          const rows = json.results ?? [];

          // No more results — break early to save quota
          if (rows.length === 0) break;

          for (const r of rows) {
            const raw = toRawJob(r, country);
            if (raw) collected.push(raw);
            if (collected.length >= params.maxResults) break;
          }

          if (collected.length >= params.maxResults) break;
          if (rows.length < RESULTS_PER_PAGE) break; // last page
        }

        return collected.slice(0, params.maxResults);
      } catch (err) {
        if (err instanceof SourcePermanentError || err instanceof SourceTransientError) throw err;
        const msg = err instanceof Error ? err.message : String(err);
        if (/aborted/i.test(msg)) {
          throw new SourcePermanentError("aborted (signal cancellation)", { cause: err });
        }
        if (/network|timeout|ECONN|ETIMEDOUT|fetch failed/i.test(msg)) {
          throw new SourceTransientError(msg, { cause: err });
        }
        throw wrapUnknownError(err, "adzuna.search");
      }
    },
  };
}
