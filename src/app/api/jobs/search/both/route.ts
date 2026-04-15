import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { searchJobs as jsearchSearch } from "@/lib/jsearch/client";
import { searchJobs as linkedinSearch } from "@/lib/linkedin/client";
import {
  dedupAcrossSources,
  searchCachedJobs,
  upsertFromJSearch,
  upsertFromLinkedIn,
} from "@/lib/repo/jobs";
import type { JobListing } from "@/lib/db/schema";

export const runtime = "nodejs";
export const maxDuration = 60;

const CACHE_TTL_MS = 60 * 60 * 1000; // 60 minutes
const PAGE_SIZE = 20;

// Module-scoped per-source caches of recent query timestamps. Keyed identically
// to the single-source routes to keep cache semantics consistent.
const jsearchRecent = new Map<string, number>();
const linkedinRecent = new Map<string, number>();

const querySchema = z.object({
  q: z.string().trim().min(1, "Missing query parameter 'q'"),
  location: z.string().trim().optional(),
  page: z
    .string()
    .optional()
    .transform((v) => {
      if (!v) return 1;
      const n = Number(v);
      return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
    }),
});

function jsearchKey(q: string, page: number): string {
  return `${page}::${q.toLowerCase()}`;
}

function linkedinKey(q: string, page: number, location?: string): string {
  return `linkedin::${page}::${q.toLowerCase()}::${location ?? ""}`;
}

/**
 * JSearch has no separate location parameter — it folds everything into
 * one natural-language query. When the user picked a location, append it
 * to the query string so JSearch returns geo-scoped results instead of
 * defaulting to US-heavy global output.
 */
function composeJSearchQuery(q: string, location: string | undefined): string {
  if (!location) return q;
  const loc = location.trim();
  if (!loc) return q;
  // If the query already mentions the location, don't duplicate.
  if (q.toLowerCase().includes(loc.toLowerCase())) return q;
  return `${q} in ${loc}`;
}

type SourceOutcome = {
  cached: boolean;
  quota: { remaining: number | null };
  jobs: JobListing[];
  error?: string;
};

async function runJSearch(
  q: string,
  page: number,
  location: string | undefined,
): Promise<SourceOutcome> {
  const composed = composeJSearchQuery(q, location);
  const key = jsearchKey(composed, page);
  const now = Date.now();
  const lastAt = jsearchRecent.get(key);
  if (lastAt && now - lastAt < CACHE_TTL_MS) {
    const rows = await searchCachedJobs(composed);
    return { cached: true, quota: { remaining: null }, jobs: rows };
  }
  const result = await jsearchSearch(composed, { page, num_pages: 1 });
  const jobs: JobListing[] = [];
  for (const j of result.data) {
    if (!j || typeof j.job_id !== "string") continue;
    try {
      const row = await upsertFromJSearch(j);
      jobs.push(row);
    } catch (err) {
      console.error("[jsearch.upsert]", err);
    }
  }
  jsearchRecent.set(key, now);
  return { cached: false, quota: result.quota, jobs };
}

async function runLinkedIn(
  q: string,
  page: number,
  location: string | undefined,
): Promise<SourceOutcome> {
  const key = linkedinKey(q, page, location);
  const now = Date.now();
  const lastAt = linkedinRecent.get(key);
  if (lastAt && now - lastAt < CACHE_TTL_MS) {
    const rows = await searchCachedJobs(q);
    return { cached: true, quota: { remaining: null }, jobs: rows };
  }
  const limit = PAGE_SIZE;
  const offset = (page - 1) * PAGE_SIZE;
  const result = await linkedinSearch(q, { location, limit, offset });
  const jobs: JobListing[] = [];
  for (const j of result.data) {
    try {
      const row = await upsertFromLinkedIn(j);
      jobs.push(row);
    } catch (err) {
      console.error("[linkedin.upsert]", err);
    }
  }
  linkedinRecent.set(key, now);
  return { cached: false, quota: result.quota, jobs };
}

export const GET = wrap(async (req: Request) => {
  const env = getEnv();
  if (!env.JSEARCH_RAPIDAPI_KEY) {
    return NextResponse.json(
      {
        error:
          "Job search is not configured. Set JSEARCH_RAPIDAPI_KEY in your environment to enable it.",
      },
      { status: 501 },
    );
  }

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    q: url.searchParams.get("q") ?? "",
    location: url.searchParams.get("location") ?? undefined,
    page: url.searchParams.get("page") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 },
    );
  }

  const { q, location, page } = parsed.data;

  const [jsearchSettled, linkedinSettled] = await Promise.allSettled([
    runJSearch(q, page, location),
    runLinkedIn(q, page, location),
  ]);

  const errors: { jsearch?: string; linkedin?: string } = {};

  let jsearchResult: SourceOutcome = {
    cached: false,
    quota: { remaining: null },
    jobs: [],
  };
  let linkedinResult: SourceOutcome = {
    cached: false,
    quota: { remaining: null },
    jobs: [],
  };

  if (jsearchSettled.status === "fulfilled") {
    jsearchResult = jsearchSettled.value;
  } else {
    const msg =
      jsearchSettled.reason instanceof Error
        ? jsearchSettled.reason.message
        : String(jsearchSettled.reason);
    errors.jsearch = msg;
    console.error("[jobs.search.both:jsearch]", msg);
  }

  if (linkedinSettled.status === "fulfilled") {
    linkedinResult = linkedinSettled.value;
  } else {
    const msg =
      linkedinSettled.reason instanceof Error
        ? linkedinSettled.reason.message
        : String(linkedinSettled.reason);
    errors.linkedin = msg;
    console.error("[jobs.search.both:linkedin]", msg);
  }

  const union = [...jsearchResult.jobs, ...linkedinResult.jobs];
  const jobs = dedupAcrossSources(union);

  const body: {
    quota: {
      jsearch: { remaining: number | null };
      linkedin: { remaining: number | null };
    };
    cached: { jsearch: boolean; linkedin: boolean };
    count: number;
    jobs: JobListing[];
    errors?: { jsearch?: string; linkedin?: string };
  } = {
    quota: {
      jsearch: jsearchResult.quota,
      linkedin: linkedinResult.quota,
    },
    cached: {
      jsearch: jsearchResult.cached,
      linkedin: linkedinResult.cached,
    },
    count: jobs.length,
    jobs,
  };

  if (errors.jsearch || errors.linkedin) {
    body.errors = errors;
  }

  return NextResponse.json(body);
});
