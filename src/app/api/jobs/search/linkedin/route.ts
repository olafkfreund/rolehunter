import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/lib/api";
import { ingestRawJobs } from "@/lib/jobs/ingest";
import { ensureAdaptersRegistered, get as getAdapter } from "@/lib/jobs/sources";
import type { SearchParams } from "@/lib/jobs/sources/types";
import { SourcePermanentError, SourceTransientError } from "@/lib/jobs/sources/errors";
import { searchCachedJobs } from "@/lib/repo/jobs";

export const runtime = "nodejs";
export const maxDuration = 60;

const CACHE_TTL_MS = 60 * 60 * 1000; // 60 minutes
const ADAPTER_TIMEOUT_MS = 120_000;
const PAGE_SIZE = 20;

ensureAdaptersRegistered();

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

  const adapter = getAdapter("linkedin");
  const availability = await adapter.available();
  if (!availability.ok) {
    return NextResponse.json(
      { error: `LinkedIn search unavailable: ${availability.reason}` },
      { status: 501 },
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

  const params: SearchParams = {
    query: q,
    location,
    maxResults: PAGE_SIZE * page,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ADAPTER_TIMEOUT_MS);

  try {
    const raw = await adapter.search(params, controller.signal);
    const results = await ingestRawJobs("linkedin", raw);
    recentQueries.set(key, now);
    return NextResponse.json({
      quota: { remaining: null },
      cached: false,
      count: results.length,
      jobs: results.map((r) => r.row),
    });
  } catch (err) {
    const status =
      err instanceof SourcePermanentError ? 502 : err instanceof SourceTransientError ? 503 : 500;
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `LinkedIn search failed: ${message}` }, { status });
  } finally {
    clearTimeout(timer);
  }
});
