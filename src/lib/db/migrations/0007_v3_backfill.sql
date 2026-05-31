-- v3.0 backfill: populate dedupe_hash, sources_seen, top_score for existing job_listings.
-- Idempotent — WHERE clauses gate the work so re-running is safe.

UPDATE "job_listings"
SET "dedupe_hash" = md5(
  lower(coalesce("title", '')) || '|' ||
  lower(coalesce("company", '')) || '|' ||
  lower(coalesce("location", '')) || '|' ||
  coalesce(to_char("posted_at"::date, 'YYYY-MM-DD'), 'unknown')
)
WHERE "dedupe_hash" IS NULL;
--> statement-breakpoint
UPDATE "job_listings"
SET "sources_seen" = jsonb_build_array(
  jsonb_build_object(
    'source',     "source"::text,
    'externalId', coalesce("external_id", "id"::text),
    'url',        coalesce("url", ''),
    'fetchedAt',  to_char("cached_at", 'YYYY-MM-DD"T"HH24:MI:SSZ')
  )
)
WHERE "sources_seen" = '[]'::jsonb;
--> statement-breakpoint
UPDATE "job_listings" j
SET "top_score" = sub.max_score
FROM (
  SELECT "job_id", MAX("score")::smallint AS max_score
  FROM "matches"
  GROUP BY "job_id"
) sub
WHERE j."id" = sub."job_id" AND j."top_score" IS NULL;
