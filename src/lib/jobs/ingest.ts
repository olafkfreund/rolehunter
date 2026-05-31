// v3.0 ingest pipeline.
//
// Normalizes a RawJob into the insert shape, computes dedupe_hash, and either:
//   (a) appends a source sighting to an existing row with the same hash
//   (b) inserts a new row with a fresh sources_seen array, then enqueues
//       auto-scoring against the active CV (fire-and-forget; lost on restart)
//
// See doc/plans/2026-05-31-rolehunter-v3-design.md §7.

import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { JobListing } from "@/lib/db/schema";
import { normalizeForInsert } from "./sources/normalize";
import type { JobSourceId, RawJob, SourceSighting } from "./sources/types";
import { enqueueScore } from "./score-queue";

export type IngestStatus = "new" | "merged";
export type IngestResult = { row: JobListing; status: IngestStatus };

export interface IngestOptions {
  searchProfileId?: number;
}

export async function ingestRawJob(
  source: JobSourceId,
  raw: RawJob,
  opts: IngestOptions = {},
): Promise<IngestResult> {
  const db = getDb();
  const values = normalizeForInsert(raw, source, opts.searchProfileId ?? null);
  const dedupeHash = values.dedupeHash;
  if (!dedupeHash) {
    // Shouldn't happen — normalizeForInsert always computes a hash — but be defensive.
    const [inserted] = await db.insert(schema.jobListings).values(values).returning();
    enqueueScore(inserted.id);
    return { row: inserted, status: "new" };
  }

  const existingRows = await db
    .select()
    .from(schema.jobListings)
    .where(eq(schema.jobListings.dedupeHash, dedupeHash))
    .limit(1);

  if (existingRows.length === 0) {
    const [inserted] = await db.insert(schema.jobListings).values(values).returning();
    enqueueScore(inserted.id);
    return { row: inserted, status: "new" };
  }

  const existing = existingRows[0];
  const seen = (existing.sourcesSeen as SourceSighting[] | null) ?? [];
  const alreadySeen = seen.some(
    (s) => s.source === source && s.externalId === raw.externalId,
  );
  const updates: Partial<typeof schema.jobListings.$inferInsert> = {
    fetchedAt: sql`NOW()` as unknown as Date,
  };

  if (!alreadySeen) {
    const incomingSighting = (values.sourcesSeen as SourceSighting[])[0];
    updates.sourcesSeen = sql`${schema.jobListings.sourcesSeen} || ${JSON.stringify([
      incomingSighting,
    ])}::jsonb` as unknown as SourceSighting[];
  }

  const [updated] = await db
    .update(schema.jobListings)
    .set(updates)
    .where(eq(schema.jobListings.id, existing.id))
    .returning();
  return { row: updated, status: "merged" };
}

export async function ingestRawJobs(
  source: JobSourceId,
  raws: RawJob[],
  opts: IngestOptions = {},
): Promise<IngestResult[]> {
  const results: IngestResult[] = [];
  for (const raw of raws) {
    try {
      results.push(await ingestRawJob(source, raw, opts));
    } catch (err) {
      console.error("[ingest] failed", { source, externalId: raw.externalId, err });
    }
  }
  return results;
}
