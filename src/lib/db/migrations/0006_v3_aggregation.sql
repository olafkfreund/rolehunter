CREATE TYPE "public"."profile_frequency" AS ENUM('hourly', 'every_4h', 'daily', 'weekly');--> statement-breakpoint
CREATE TYPE "public"."search_run_status" AS ENUM('running', 'success', 'failed', 'partial', 'skipped_budget');--> statement-breakpoint
ALTER TYPE "public"."job_source" ADD VALUE 'adzuna';--> statement-breakpoint
ALTER TYPE "public"."job_source" ADD VALUE 'indeed';--> statement-breakpoint
ALTER TYPE "public"."job_source" ADD VALUE 'dice';--> statement-breakpoint
ALTER TYPE "public"."job_source" ADD VALUE 'jobspy';--> statement-breakpoint
ALTER TYPE "public"."job_source" ADD VALUE 'apify';--> statement-breakpoint
ALTER TYPE "public"."llm_provider" ADD VALUE 'openai';--> statement-breakpoint
ALTER TYPE "public"."llm_provider" ADD VALUE 'ollama';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "search_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"query" text NOT NULL,
	"location" varchar(200),
	"location_radius_km" integer,
	"salary_min_usd" integer,
	"salary_max_usd" integer,
	"salary_currency" varchar(8) DEFAULT 'USD',
	"remote_modes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"experience_levels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"job_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sources" jsonb NOT NULL,
	"frequency" "profile_frequency" DEFAULT 'daily' NOT NULL,
	"max_results_per_run" integer DEFAULT 50 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"next_run_at" timestamp DEFAULT now() NOT NULL,
	"last_run_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "search_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"profile_id" integer NOT NULL,
	"source" "job_source" NOT NULL,
	"status" "search_run_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"duration_ms" integer,
	"jobs_found" integer DEFAULT 0 NOT NULL,
	"jobs_new" integer DEFAULT 0 NOT NULL,
	"jobs_duplicate" integer DEFAULT 0 NOT NULL,
	"jobs_failed_score" integer DEFAULT 0 NOT NULL,
	"cost_usd_estimate" numeric(10, 4),
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "source_budgets" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"month_year" varchar(7) NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"estimated_spend_usd" numeric(10, 4) DEFAULT '0' NOT NULL,
	"monthly_cap_usd" numeric(10, 4) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "source_quotas_daily" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" "job_source" NOT NULL,
	"day" date NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"daily_cap" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_listings" ADD COLUMN "dedupe_hash" text;--> statement-breakpoint
ALTER TABLE "job_listings" ADD COLUMN "sources_seen" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "job_listings" ADD COLUMN "fetched_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "job_listings" ADD COLUMN "top_score" smallint;--> statement-breakpoint
ALTER TABLE "job_listings" ADD COLUMN "search_profile_id" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "search_runs" ADD CONSTRAINT "search_runs_profile_id_search_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."search_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "search_profiles_due_idx" ON "search_profiles" USING btree ("active","next_run_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "search_runs_profile_idx" ON "search_runs" USING btree ("profile_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "search_runs_status_idx" ON "search_runs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "source_budgets_uniq_month_idx" ON "source_budgets" USING btree ("source","month_year");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "source_quotas_daily_uniq_idx" ON "source_quotas_daily" USING btree ("source","day");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_listings" ADD CONSTRAINT "job_listings_search_profile_id_search_profiles_id_fk" FOREIGN KEY ("search_profile_id") REFERENCES "public"."search_profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_listings_feed_idx" ON "job_listings" USING btree ("top_score" DESC NULLS LAST,"fetched_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_listings_dedupe_idx" ON "job_listings" USING btree ("dedupe_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_listings_fetched_idx" ON "job_listings" USING btree ("fetched_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_listings_profile_idx" ON "job_listings" USING btree ("search_profile_id");