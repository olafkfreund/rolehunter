import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { searchJobs as linkedinSearch } from "@/lib/linkedin/client";
import { searchCachedJobs, upsertFromLinkedIn } from "@/lib/repo/jobs";

export const runtime = "nodejs";
export const maxDuration = 60;

const CACHE_TTL_MS = 60 * 60 * 1000; // 60 minutes
const PAGE_SIZE = 20;

// Module-scoped in-memory cache of recent query timestamps.
const recentQueries = new Map<string, number>();

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

function cacheKey(q: string, page: number, location?: string): string {
  return `linkedin::${page}::${q.toLowerCase()}::${location ?? ""}`;
}

export const GET = wrap(async (req: Request) => {
  const env = getEnv();
  if (!env.JSEARCH_RAPIDAPI_KEY) {
    return NextResponse.json(
      {
        error:
          "LinkedIn search is not configured. Set JSEARCH_RAPIDAPI_KEY in your environment to enable it.",
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
  const key = cacheKey(q, page, location);
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

  const limit = PAGE_SIZE;
  const offset = (page - 1) * PAGE_SIZE;
  const result = await linkedinSearch(q, { location, limit, offset });

  const upserted = [];
  for (const j of result.data) {
    try {
      const row = await upsertFromLinkedIn(j);
      upserted.push(row);
    } catch (err) {
      console.error("[linkedin.upsert]", err);
    }
  }
  recentQueries.set(key, now);

  return NextResponse.json({
    quota: result.quota,
    cached: false,
    count: upserted.length,
    jobs: upserted,
  });
});
