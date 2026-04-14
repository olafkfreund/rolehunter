CREATE TYPE "public"."job_source" AS ENUM('paste', 'jsearch');--> statement-breakpoint
CREATE TYPE "public"."llm_provider" AS ENUM('claude', 'gemini');--> statement-breakpoint
CREATE TYPE "public"."application_stage" AS ENUM('saved', 'applied', 'phone', 'onsite', 'offer', 'rejected');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "applications" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"stage" "application_stage" DEFAULT 'saved' NOT NULL,
	"applied_at" timestamp,
	"notes_md" text DEFAULT '' NOT NULL,
	"reminder_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cv_master" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text DEFAULT 'My CV' NOT NULL,
	"raw_markdown" text NOT NULL,
	"parsed_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_file_path" text,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cv_variants" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"match_id" integer,
	"tailored_markdown" text NOT NULL,
	"pdf_path" text,
	"keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"provider" "llm_provider" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "job_listings" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" "job_source" NOT NULL,
	"external_id" varchar(255),
	"title" text NOT NULL,
	"company" text DEFAULT '' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"url" text,
	"description" text NOT NULL,
	"posted_at" timestamp,
	"salary_min" integer,
	"salary_max" integer,
	"salary_currency" varchar(8),
	"raw_json" jsonb,
	"cached_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "linkedin_scans" (
	"id" serial PRIMARY KEY NOT NULL,
	"target_role" text NOT NULL,
	"provider" "llm_provider" NOT NULL,
	"score" integer NOT NULL,
	"keyword_coverage" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"suggestions_md" text DEFAULT '' NOT NULL,
	"rewritten_headline" text,
	"rewritten_about" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"cv_master_id" integer NOT NULL,
	"provider" "llm_provider" NOT NULL,
	"score" integer NOT NULL,
	"strengths" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"gaps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reasoning_md" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "profile" (
	"id" serial PRIMARY KEY NOT NULL,
	"full_name" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"avatar_path" text,
	"linkedin_url" text,
	"linkedin_headline" text,
	"linkedin_about" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "applications" ADD CONSTRAINT "applications_job_id_job_listings_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job_listings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cv_variants" ADD CONSTRAINT "cv_variants_job_id_job_listings_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job_listings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cv_variants" ADD CONSTRAINT "cv_variants_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "matches" ADD CONSTRAINT "matches_job_id_job_listings_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job_listings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "matches" ADD CONSTRAINT "matches_cv_master_id_cv_master_id_fk" FOREIGN KEY ("cv_master_id") REFERENCES "public"."cv_master"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "job_listings_external_idx" ON "job_listings" USING btree ("source","external_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_listings_title_idx" ON "job_listings" USING btree ("title");