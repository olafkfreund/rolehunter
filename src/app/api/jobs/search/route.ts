import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { searchJobs } from "@/lib/jsearch/client";
import { searchCachedJobs, upsertFromJSearch } from "@/lib/repo/jobs";

export const runtime = "nodejs";
export const maxDuration = 60;

const CACHE_TTL_MS = 60 * 60 * 1000; // 60 minutes

// Module-scoped in-memory cache of recent query timestamps.
const recentQueries = new Map<string, number>();

function cacheKey(q: string, page: number): string {
  return `${page}::${q.toLowerCase().trim()}`;
}

export async function GET(req: Request) {
  const env = getEnv();
  if (!env.JSEARCH_RAPIDAPI_KEY) {
    return NextResponse.json(
      {
        error:
          "JSearch is not configured. Set JSEARCH_RAPIDAPI_KEY in your environment to enable search.",
      },
      { status: 501 },
    );
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const pageRaw = url.searchParams.get("page");
  const page = pageRaw ? Math.max(1, Number(pageRaw) || 1) : 1;

  if (!q) {
    return NextResponse.json({ error: "Missing query parameter 'q'" }, { status: 400 });
  }

  const key = cacheKey(q, page);
  const lastAt = recentQueries.get(key);
  const now = Date.now();

  if (lastAt && now - lastAt < CACHE_TTL_MS) {
    const rows = await searchCachedJobs(q);
    return NextResponse.json({
      quota: { remaining: null },
      cached: true,
      count: rows.length,
      jobs: rows,
    });
  }

  const result = await searchJobs(q, { page, num_pages: 1 });
  const upserted = [];
  for (const j of result.data) {
    if (!j || typeof j.job_id !== "string") continue;
    const row = await upsertFromJSearch(j);
    upserted.push(row);
  }
  recentQueries.set(key, now);

  return NextResponse.json({
    quota: result.quota,
    cached: false,
    count: upserted.length,
    jobs: upserted,
  });
}
