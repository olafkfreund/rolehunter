import { NextResponse } from "next/server";
import { ingestRawJobs } from "@/lib/jobs/ingest";
import { ensureAdaptersRegistered, get as getAdapter } from "@/lib/jobs/sources";
import type { SearchParams } from "@/lib/jobs/sources/types";
import { SourcePermanentError, SourceTransientError } from "@/lib/jobs/sources/errors";
import { searchCachedJobs } from "@/lib/repo/jobs";

export const runtime = "nodejs";
export const maxDuration = 60;

const CACHE_TTL_MS = 60 * 60 * 1000; // 60 minutes — avoid burning RapidAPI quota on repeated identical searches
const ADAPTER_TIMEOUT_MS = 120_000;
const RESULTS_PER_PAGE = 10;

ensureAdaptersRegistered();

const recentQueries = new Map<string, number>();

function cacheKey(q: string, page: number): string {
  return `jsearch::${page}::${q.toLowerCase().trim()}`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const pageRaw = url.searchParams.get("page");
  const page = pageRaw ? Math.max(1, Number(pageRaw) || 1) : 1;

  if (!q) {
    return NextResponse.json({ error: "Missing query parameter 'q'" }, { status: 400 });
  }

  const adapter = getAdapter("jsearch");
  const availability = await adapter.available();
  if (!availability.ok) {
    return NextResponse.json(
      {
        error: `JSearch unavailable: ${availability.reason}. Set JSEARCH_RAPIDAPI_KEY to enable.`,
      },
      { status: 501 },
    );
  }

  const key = cacheKey(q, page);
  const now = Date.now();
  const lastAt = recentQueries.get(key);

  if (lastAt && now - lastAt < CACHE_TTL_MS) {
    const rows = await searchCachedJobs(q);
    return NextResponse.json({
      quota: { remaining: null },
      cached: true,
      count: rows.length,
      jobs: rows,
    });
  }

  const params: SearchParams = {
    query: q,
    maxResults: RESULTS_PER_PAGE * page,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ADAPTER_TIMEOUT_MS);

  try {
    const raw = await adapter.search(params, controller.signal);
    const results = await ingestRawJobs("jsearch", raw);
    recentQueries.set(key, now);
    return NextResponse.json({
      quota: { remaining: null }, // adapter does not yet thread RapidAPI quota
      cached: false,
      count: results.length,
      jobs: results.map((r) => r.row),
    });
  } catch (err) {
    const status =
      err instanceof SourcePermanentError ? 502 : err instanceof SourceTransientError ? 503 : 500;
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `JSearch search failed: ${message}` }, { status });
  } finally {
    clearTimeout(timer);
  }
}
