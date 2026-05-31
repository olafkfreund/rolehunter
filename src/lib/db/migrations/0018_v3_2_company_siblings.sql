-- v3.2 final-stretch (#43): 6 company sibling tables + commute/benefit prefs.
--
-- Each sibling holds per-source enrichment data referencing the canonical
-- company. ON DELETE CASCADE so removing a company tidies up. Adapters land
-- in src/lib/companies/sources/ and write to these tables on enrich.

-- ── Profile additions for /settings/company-prefs ───────────────────────
ALTER TABLE "profile" ADD COLUMN IF NOT EXISTS "max_commute_minutes" smallint;
ALTER TABLE "profile" ADD COLUMN IF NOT EXISTS "preferred_transport_mode" varchar(16);
ALTER TABLE "profile" ADD COLUMN IF NOT EXISTS "benefit_priorities" jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ── Enums ───────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "company_review_source" AS ENUM ('glassdoor','blind','fishbowl','other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "company_news_kind" AS ENUM ('news','funding','acquisition','ipo','leadership','press_release');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "company_connection_kind" AS ENUM ('current_employee','alumni','school_alumni','mutual_connection');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Offices ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "company_offices" (
    "id" serial PRIMARY KEY NOT NULL,
    "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
    "label" text NOT NULL DEFAULT '',
    "address" text,
    "lat" double precision,
    "lng" double precision,
    "amenities" jsonb NOT NULL DEFAULT '[]'::jsonb,
    "created_at" timestamp DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS "company_offices_company_idx" ON "company_offices" ("company_id");

-- ── Reviews ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "company_reviews" (
    "id" serial PRIMARY KEY NOT NULL,
    "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
    "source" "company_review_source" NOT NULL,
    "title" text,
    "body" text NOT NULL DEFAULT '',
    "rating" numeric(3,2),
    "pros" text,
    "cons" text,
    "role" text,
    "posted_at" timestamp,
    "raw_json" jsonb,
    "fetched_at" timestamp DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS "company_reviews_company_idx" ON "company_reviews" ("company_id");
CREATE INDEX IF NOT EXISTS "company_reviews_source_idx" ON "company_reviews" ("source");

-- ── Benefits ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "company_benefits" (
    "id" serial PRIMARY KEY NOT NULL,
    "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
    "category" varchar(64) NOT NULL,
    "description" text NOT NULL,
    "value_text" text,
    "source" varchar(64),
    "raw_json" jsonb,
    "fetched_at" timestamp DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS "company_benefits_company_idx" ON "company_benefits" ("company_id");

-- ── News / funding / press ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "company_news" (
    "id" serial PRIMARY KEY NOT NULL,
    "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
    "kind" "company_news_kind" NOT NULL DEFAULT 'news',
    "title" text NOT NULL,
    "summary" text NOT NULL DEFAULT '',
    "url" text,
    "source" varchar(64),
    "published_at" timestamp,
    "raw_json" jsonb,
    "fetched_at" timestamp DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS "company_news_company_idx" ON "company_news" ("company_id");
CREATE INDEX IF NOT EXISTS "company_news_published_idx" ON "company_news" ("published_at" DESC);

-- ── Layoffs ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "company_layoffs" (
    "id" serial PRIMARY KEY NOT NULL,
    "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
    "affected_count" integer,
    "percent_of_workforce" numeric(5,2),
    "announced_at" timestamp NOT NULL,
    "source_url" text,
    "summary" text NOT NULL DEFAULT '',
    "raw_json" jsonb,
    "fetched_at" timestamp DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS "company_layoffs_company_idx" ON "company_layoffs" ("company_id");
CREATE INDEX IF NOT EXISTS "company_layoffs_announced_idx" ON "company_layoffs" ("announced_at" DESC);

-- ── Connections (network mapping at this employer) ─────────────────────
CREATE TABLE IF NOT EXISTS "company_connections" (
    "id" serial PRIMARY KEY NOT NULL,
    "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
    "kind" "company_connection_kind" NOT NULL,
    "name" text NOT NULL DEFAULT '',
    "headline" text,
    "linkedin_url" text,
    "shared_school" text,
    "raw_json" jsonb,
    "fetched_at" timestamp DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS "company_connections_company_idx" ON "company_connections" ("company_id");

-- ── Cached per-company fit score ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "company_fit_scores" (
    "id" serial PRIMARY KEY NOT NULL,
    "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
    "score" smallint NOT NULL,
    "breakdown_json" jsonb NOT NULL,
    "computed_at" timestamp DEFAULT NOW() NOT NULL,
    CONSTRAINT "company_fit_scores_company_unique" UNIQUE ("company_id")
);
