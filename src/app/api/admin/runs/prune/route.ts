// POST /api/admin/runs/prune — delete search_runs older than retentionDays
// (default 90). Returns the number of rows pruned.
//
// Body (optional JSON):
//   { retentionDays: number }    // 7-365, default 90
//
// Response:
//   { pruned: number, beforeDate: 'YYYY-MM-DD' }
//
// See doc/plans/2026-05-31-rolehunter-v3-design.md §9.5.

import { NextResponse } from "next/server";
import { lt, sql } from "drizzle-orm";
import { z } from "zod";
import { wrap } from "@/lib/api";
import { getDb, schema } from "@/lib/db";

export const runtime = "nodejs";

const bodySchema = z.object({
  retentionDays: z.coerce.number().int().min(7).max(365).default(90),
});

export const POST = wrap(async (req: Request) => {
  let retentionDays = 90;
  try {
    const text = await req.text();
    if (text) {
      const parsed = bodySchema.safeParse(JSON.parse(text));
      if (parsed.success) {
        retentionDays = parsed.data.retentionDays;
      }
    }
  } catch {
    // Body is optional — keep default.
  }

  const db = getDb();
  const result = await db
    .delete(schema.searchRuns)
    .where(lt(schema.searchRuns.startedAt, sql`NOW() - (${retentionDays} || ' days')::interval`))
    .returning({ id: schema.searchRuns.id });

  const beforeDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  return NextResponse.json({
    pruned: result.length,
    beforeDate,
  });
});
