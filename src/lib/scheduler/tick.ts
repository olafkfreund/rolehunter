// Scheduler tick — runs every 60s. Picks due profiles, claims them by advancing
// next_run_at, fires async per-profile work without awaiting.
//
// Postgres advisory lock serialises ticks across the (in dev) brief overlap of
// hot-reloaded workers AND would serialise across instances if we ever ran
// multi-replica. See spec §6.2 + D-04 single-instance assumption.

import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { SearchProfile } from "@/lib/db/schema";
import { getEnv } from "@/lib/env";
import { runProfile } from "./run-profile";

// Arbitrary int4 lock key — "COHS" in ASCII (chosen to be distinctive in pg_locks).
const TICK_LOCK_KEY = 0x434f4853;

const inFlight = new Set<number>();

export async function tick(): Promise<void> {
  const env = getEnv();
  const batchSize = env.SCHEDULER_BATCH_SIZE;
  const db = getDb();

  let due: SearchProfile[] = [];

  try {
    due = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${TICK_LOCK_KEY})`);

      const rows = await tx
        .select()
        .from(schema.searchProfiles)
        .where(
          and(
            eq(schema.searchProfiles.active, true),
            lte(schema.searchProfiles.nextRunAt, sql`NOW()`),
          ),
        )
        .orderBy(schema.searchProfiles.nextRunAt)
        .limit(batchSize);

      if (rows.length === 0) return [];

      // Defensive: skip profiles already mid-flight (shouldn't happen given the
      // lock + claim, but if a single tick takes > 60s and the lock is reentrant
      // somehow, this prevents double-fire).
      const eligible = rows.filter((r) => !inFlight.has(r.id));
      if (eligible.length === 0) return [];

      // Claim BEFORE work — advance next_run_at inside the same transaction so a
      // crash mid-fetch doesn't trap a profile in "due forever".
      await tx
        .update(schema.searchProfiles)
        .set({
          lastRunAt: sql`NOW()`,
          nextRunAt: sql`NOW() + CASE ${schema.searchProfiles.frequency}
            WHEN 'hourly' THEN interval '1 hour'
            WHEN 'every_4h' THEN interval '4 hours'
            WHEN 'daily' THEN interval '1 day'
            WHEN 'weekly' THEN interval '7 days'
          END`,
          updatedAt: sql`NOW()`,
        })
        .where(
          inArray(
            schema.searchProfiles.id,
            eligible.map((r) => r.id),
          ),
        );

      return eligible;
    });
  } catch (err) {
    console.error("[scheduler] tick transaction failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  // Outside the transaction: fire async work for each profile. No await — these
  // run independently. Errors are captured + logged; the search_runs rows hold
  // per-source outcomes for the UI.
  for (const profile of due) {
    inFlight.add(profile.id);
    runProfile(profile)
      .catch((err) =>
        console.error("[scheduler] runProfile crash", {
          profileId: profile.id,
          err: err instanceof Error ? err.message : String(err),
        }),
      )
      .finally(() => {
        inFlight.delete(profile.id);
      });
  }
}

export function inFlightCount(): number {
  return inFlight.size;
}
