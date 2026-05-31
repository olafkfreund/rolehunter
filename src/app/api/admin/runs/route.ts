// GET /api/admin/runs — scheduler run history.
//
// Query params (all optional):
//   limit       int, 1-500, default 100
//   status      one of: running | success | failed | partial | skipped_budget
//   profileId   int — filter by search_profiles.id
//   source      job_source enum value (paste, jsearch, linkedin, adzuna,
//               indeed, dice, jobspy, apify) — filter by adapter
//
// Response shape:
//   {
//     count: number,
//     runs: SearchRun[],
//     aggregate: {
//       byStatus: Record<status, number>,
//       totalDurationMs: number,
//       totalJobsFound: number,
//       totalJobsNew: number,
//       totalCostUsd: number,
//     }
//   }
//
// See doc/plans/2026-05-31-rolehunter-v3-design.md §9.5.

import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { z } from "zod";
import { wrap } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import type { SearchRun } from "@/lib/db/schema";

export const runtime = "nodejs";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  status: z.enum(["running", "success", "failed", "partial", "skipped_budget"]).optional(),
  profileId: z.coerce.number().int().positive().optional(),
  source: z
    .enum(["paste", "jsearch", "linkedin", "adzuna", "indeed", "dice", "jobspy", "apify"])
    .optional(),
});

type RunStatus = SearchRun["status"];

interface Aggregate {
  byStatus: Record<RunStatus, number>;
  totalDurationMs: number;
  totalJobsFound: number;
  totalJobsNew: number;
  totalCostUsd: number;
}

function aggregateRuns(runs: SearchRun[]): Aggregate {
  const byStatus: Record<RunStatus, number> = {
    running: 0,
    success: 0,
    failed: 0,
    partial: 0,
    skipped_budget: 0,
  };
  let totalDurationMs = 0;
  let totalJobsFound = 0;
  let totalJobsNew = 0;
  let totalCostUsd = 0;

  for (const run of runs) {
    byStatus[run.status] = (byStatus[run.status] ?? 0) + 1;
    if (run.durationMs) totalDurationMs += run.durationMs;
    totalJobsFound += run.jobsFound;
    totalJobsNew += run.jobsNew;
    if (run.costUsdEstimate) totalCostUsd += Number(run.costUsdEstimate);
  }

  return {
    byStatus,
    totalDurationMs,
    totalJobsFound,
    totalJobsNew,
    totalCostUsd: Math.round(totalCostUsd * 10_000) / 10_000,
  };
}

export const GET = wrap(async (req: Request) => {
  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    limit: url.searchParams.get("limit") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    profileId: url.searchParams.get("profileId") ?? undefined,
    source: url.searchParams.get("source") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") },
      { status: 400 },
    );
  }

  const { limit, status, profileId, source } = parsed.data;
  const db = getDb();

  const conditions: SQL[] = [];
  if (status) conditions.push(eq(schema.searchRuns.status, status));
  if (profileId) conditions.push(eq(schema.searchRuns.profileId, profileId));
  if (source) conditions.push(eq(schema.searchRuns.source, source));

  const runs = await db
    .select()
    .from(schema.searchRuns)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(schema.searchRuns.startedAt))
    .limit(limit);

  return NextResponse.json({
    count: runs.length,
    runs,
    aggregate: aggregateRuns(runs),
  });
});
