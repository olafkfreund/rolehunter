-- v3.2 — cache the resolved distance (km) per job so /jobs can show a "🚊 N km"
-- chip alongside the existing FIT chip without recomputing per row.
-- Profile-dependent; stale on home-address change → next /jobs/[id] view
-- overwrites it.

ALTER TABLE "job_listings" ADD COLUMN IF NOT EXISTS "distance_km" smallint;
ALTER TABLE "job_listings" ADD COLUMN IF NOT EXISTS "distance_scored_at" timestamp;
