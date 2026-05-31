// ts-jobspy adapter — wraps the TypeScript port of speedyapply/JobSpy
// to fetch from LinkedIn + Indeed in a single library call.
//
// ts-jobspy v2.x supports LinkedIn and Indeed (the v1.x line also supported
// Glassdoor/ZipRecruiter/Google, but those scrapers were retired in v2).
// We get them via separate adapters or accept the v2.x scope.
//
// LinkedIn rate-limits ~10th page with a single IP — we don't yet thread
// proxies. Partial failure is acceptable; what we got is what we return.
//
// See doc/plans/2026-05-31-rolehunter-v3-design.md §5.5.

import crypto from "node:crypto";
import { scrapeJobs } from "ts-jobspy";
import { SourcePermanentError, SourceTransientError, wrapUnknownError } from "./errors";
import type { JobSource, RawJob, SearchParams, SalaryPeriod } from "./types";

type JobspyBoard = "linkedin" | "indeed";

interface JobspyResult {
  site?: string;
  company?: string;
  title?: string;
  location?: string;
  datePosted?: string;
  description?: string;
  jobUrl?: string;
  jobUrlDirect?: string;
  salarySource?: string;
  interval?: string;
  minAmount?: number;
  maxAmount?: number;
  currency?: string;
  isRemote?: boolean;
}

function parseBoards(raw: string | undefined): JobspyBoard[] {
  const fallback: JobspyBoard[] = ["linkedin", "indeed"];
  if (!raw) return fallback;
  const allowed: JobspyBoard[] = ["linkedin", "indeed"];
  const picked = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is JobspyBoard => (allowed as string[]).includes(s));
  return picked.length > 0 ? picked : fallback;
}

function parsePeriod(interval: string | undefined): SalaryPeriod | undefined {
  if (!interval) return undefined;
  const v = interval.toLowerCase();
  if (v.includes("year") || v === "yearly") return "year";
  if (v.includes("month") || v === "monthly") return "month";
  if (v.includes("hour") || v === "hourly") return "hour";
  return undefined;
}

function syntheticExternalId(j: JobspyResult): string {
  const seed = j.jobUrl ?? `${j.title ?? ""}|${j.company ?? ""}|${j.datePosted ?? ""}`;
  return `jobspy-${crypto.createHash("md5").update(seed).digest("hex").slice(0, 16)}`;
}

function toRawJob(j: JobspyResult): RawJob | null {
  if (!j.title || !j.jobUrl) return null;
  const salary =
    j.minAmount != null || j.maxAmount != null
      ? {
          min: j.minAmount ?? undefined,
          max: j.maxAmount ?? undefined,
          currency: j.currency ?? "USD",
          period: parsePeriod(j.interval) ?? "year",
        }
      : undefined;

  return {
    externalId: syntheticExternalId(j),
    title: j.title,
    company: j.company ?? "",
    location: { raw: j.location ?? undefined },
    remoteMode: j.isRemote ? "remote" : undefined,
    description: j.description ?? "",
    salary,
    postedAt: j.datePosted ?? undefined,
    url: j.jobUrlDirect && j.jobUrlDirect !== "null" ? j.jobUrlDirect : j.jobUrl,
    rawSource: j,
  };
}

// Map ISO-2 country hint to ts-jobspy's countryIndeed string. ts-jobspy expects
// human-readable country names ("USA", "UK", "Germany") rather than ISO codes.
const COUNTRY_HINT_TO_INDEED: Record<string, string> = {
  us: "USA",
  gb: "UK",
  uk: "UK",
  ca: "Canada",
  au: "Australia",
  de: "Germany",
  fr: "France",
  nl: "Netherlands",
  ie: "Ireland",
  in: "India",
  sg: "Singapore",
  jp: "Japan",
};

function mapCountryIndeed(hint?: string): string | undefined {
  if (!hint) return undefined;
  return COUNTRY_HINT_TO_INDEED[hint.toLowerCase()];
}

export function createJobSpyAdapter(): JobSource {
  return {
    id: "jobspy",
    displayName: "JobSpy (LinkedIn + Indeed scraper)",
    available: async () => {
      // ts-jobspy is a library, not a service — it's always "available" if the
      // module loaded. The actual fetch may still fail (rate-limit, network), but
      // those are handled in search().
      return { ok: true };
    },
    costEstimate: () => 0, // free library
    search: async (params: SearchParams, signal: AbortSignal): Promise<RawJob[]> => {
      if (signal.aborted) {
        throw new SourcePermanentError("aborted before start");
      }
      const boards = parseBoards(process.env.JOBSPY_BOARDS);
      const countryIndeed = mapCountryIndeed(params.countryHint);

      // ts-jobspy doesn't accept AbortSignal natively. We race the scrape against
      // a manual abort listener so 120s scheduler timeouts still bail us out.
      let aborted = false;
      const abortPromise = new Promise<never>((_, reject) => {
        signal.addEventListener(
          "abort",
          () => {
            aborted = true;
            reject(new SourcePermanentError("aborted mid-scrape (ts-jobspy does not thread AbortSignal)"));
          },
          { once: true },
        );
      });

      try {
        const fetchDescriptionRaw = process.env.JOBSPY_LINKEDIN_FETCH_DESCRIPTION;
        const linkedinFetchDescription = fetchDescriptionRaw === "1" || fetchDescriptionRaw === "true";

        const scrapePromise = scrapeJobs({
          siteName: boards,
          searchTerm: params.query,
          location: params.location,
          resultsWanted: params.maxResults,
          countryIndeed,
          isRemote: params.remoteModes?.includes("remote") ? true : undefined,
          linkedinFetchDescription,
        }) as Promise<JobspyResult[]>;

        const jobs = await Promise.race([scrapePromise, abortPromise]);
        if (aborted) {
          throw new SourcePermanentError("aborted mid-scrape");
        }

        const mapped: RawJob[] = [];
        for (const j of jobs) {
          const raw = toRawJob(j);
          if (raw) mapped.push(raw);
          if (mapped.length >= params.maxResults) break;
        }
        return mapped;
      } catch (err) {
        if (err instanceof SourcePermanentError || err instanceof SourceTransientError) throw err;
        const msg = err instanceof Error ? err.message : String(err);
        // LinkedIn rate-limit signals: 429, "Too Many Requests", or block pages
        if (/429|too many requests|rate limit|blocked/i.test(msg)) {
          throw new SourceTransientError(`ts-jobspy rate-limited: ${msg}`, { cause: err });
        }
        if (/aborted/i.test(msg)) {
          throw new SourcePermanentError(msg, { cause: err });
        }
        if (/network|timeout|ECONN|ETIMEDOUT|fetch failed|ENOTFOUND/i.test(msg)) {
          throw new SourceTransientError(msg, { cause: err });
        }
        throw wrapUnknownError(err, "jobspy.search");
      }
    },
  };
}
