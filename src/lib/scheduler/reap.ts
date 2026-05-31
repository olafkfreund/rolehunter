// Boot-time orphan reaper: any search_runs left in 'running' status older than
// 5 minutes are marked 'failed' so they don't pollute "in-progress" UI views.
//
// Safety net only — not a primary mechanism. Matters when a previous process
// crashed mid-fetch and left a row stuck.
//
// See doc/plans/2026-05-31-rolehunter-v3-design.md §6.5.

import { and, eq, lt, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

export async function reapOrphanedRuns(): Promise<number> {
  const db = getDb();
  const result = await db
    .update(schema.searchRuns)
    .set({
      status: "failed",
      finishedAt: sql`NOW()`,
      errorMessage: "orphaned_at_shutdown — reaped on boot",
    })
    .where(
      and(
        eq(schema.searchRuns.status, "running"),
        lt(schema.searchRuns.startedAt, sql`NOW() - interval '5 minutes'`),
      ),
    )
    .returning({ id: schema.searchRuns.id });
  return result.length;
}
