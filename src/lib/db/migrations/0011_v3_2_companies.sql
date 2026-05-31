-- v3.2 epic #43 slice 1 — canonical companies table + nullable FK from job_listings.
--
-- Slice 1 only populates zero-cost fields (Wikidata + Layoffs.fyi + Clearbit
-- logo URL). Later slices add columns / sibling tables for Glassdoor,
-- Levels.fyi, Crunchbase, Google Maps. The slug column is the dedup key —
-- one row per slugified company name.

CREATE TABLE IF NOT EXISTS "companies" (
    "id" serial PRIMARY KEY NOT NULL,
    "name" text NOT NULL,
    "slug" text NOT NULL,
    "website" text,
    "headquarters" text,
    "founded_year" integer,
    "summary" text NOT NULL DEFAULT '',
    "logo_url" text,
    "wikidata_id" text,
    "linkedin_url" text,
    "glassdoor_url" text,
    "has_recent_layoff" boolean NOT NULL DEFAULT false,
    "last_layoff_at" timestamp,
    "last_layoff_count" integer,
    "enrichment_synced_at" timestamp,
    "raw_json" jsonb,
    "created_at" timestamp DEFAULT NOW() NOT NULL,
    "updated_at" timestamp DEFAULT NOW() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "companies_slug_idx" ON "companies" ("slug");

ALTER TABLE "job_listings"
    ADD COLUMN IF NOT EXISTS "company_id" integer
    REFERENCES "companies"("id") ON DELETE SET NULL;
