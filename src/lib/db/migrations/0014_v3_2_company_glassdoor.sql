-- v3.2 epic #43 slice 3 — Glassdoor enrichment columns on companies.
-- Populated by the Apify Glassdoor actor adapter when
-- APIFY_GLASSDOOR_ACTOR_ID is configured. If the env is absent the
-- enrichment skips silently and these stay null.

ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "glassdoor_rating" numeric(3,2);
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "glassdoor_review_count" integer;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "glassdoor_recommend_pct" smallint;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "glassdoor_ceo_approval_pct" smallint;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "glassdoor_top_pro" text;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "glassdoor_top_con" text;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "glassdoor_synced_at" timestamp;
