CREATE TYPE "public"."company_connection_kind" AS ENUM('current_employee', 'alumni', 'school_alumni', 'mutual_connection');--> statement-breakpoint
CREATE TYPE "public"."company_news_kind" AS ENUM('news', 'funding', 'acquisition', 'ipo', 'leadership', 'press_release');--> statement-breakpoint
CREATE TYPE "public"."company_review_source" AS ENUM('glassdoor', 'blind', 'fishbowl', 'other');--> statement-breakpoint
CREATE TYPE "public"."feedback_source" AS ENUM('recruiter', 'self', 'llm_synthesis');--> statement-breakpoint
CREATE TYPE "public"."flashcard_category" AS ENUM('behavioral', 'role_specific', 'company_specific', 'technical');--> statement-breakpoint
CREATE TYPE "public"."interview_status" AS ENUM('scheduled', 'completed', 'cancelled', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."interview_type" AS ENUM('phone', 'video', 'onsite', 'take_home', 'technical', 'system_design', 'behavioral', 'final');--> statement-breakpoint
CREATE TYPE "public"."job_source" AS ENUM('paste', 'jsearch', 'linkedin', 'adzuna', 'indeed', 'dice', 'jobspy', 'apify', 'greenhouse', 'lever', 'workday');--> statement-breakpoint
CREATE TYPE "public"."gap_learning_status" AS ENUM('to_learn', 'learning', 'done', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."portfolio_kind" AS ENUM('github_repo', 'gitlab_repo', 'blog_post', 'website', 'obsidian_note', 'manual_project', 'manual_skill', 'manual_role');--> statement-breakpoint
CREATE TYPE "public"."application_priority" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."profile_frequency" AS ENUM('hourly', 'every_4h', 'daily', 'weekly');--> statement-breakpoint
CREATE TYPE "public"."llm_provider" AS ENUM('claude', 'gemini', 'openai', 'ollama');--> statement-breakpoint
CREATE TYPE "public"."rejection_category" AS ENUM('resume_screen', 'technical', 'behavioral', 'culture', 'salary', 'position_closed', 'other');--> statement-breakpoint
CREATE TYPE "public"."search_run_status" AS ENUM('running', 'success', 'failed', 'partial', 'skipped_budget');--> statement-breakpoint
CREATE TYPE "public"."application_stage" AS ENUM('saved', 'applied', 'phone', 'onsite', 'offer', 'rejected');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"is_secret" boolean DEFAULT false NOT NULL,
	"description" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "applications" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"stage" "application_stage" DEFAULT 'saved' NOT NULL,
	"priority" "application_priority" DEFAULT 'medium' NOT NULL,
	"applied_at" timestamp,
	"notes_md" text DEFAULT '' NOT NULL,
	"reminder_at" timestamp,
	"last_contact" timestamp,
	"excitement" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "canonical_gap_resources" (
	"id" serial PRIMARY KEY NOT NULL,
	"canonical_gap_id" integer NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"kind" text NOT NULL,
	"rationale" text DEFAULT '' NOT NULL,
	"order_idx" integer DEFAULT 0 NOT NULL,
	"provider" "llm_provider" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "canonical_gap_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"canonical_gap_id" integer NOT NULL,
	"match_id" integer NOT NULL,
	"raw_phrase" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "canonical_gaps" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"normalized_key" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"learning_status" "gap_learning_status" DEFAULT 'to_learn' NOT NULL,
	"occurrences" integer DEFAULT 0 NOT NULL,
	"last_clustered_at" timestamp DEFAULT now() NOT NULL,
	"resources_fetched_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"website" text,
	"headquarters" text,
	"hq_lat" double precision,
	"hq_lng" double precision,
	"hq_geocoded_at" timestamp,
	"founded_year" integer,
	"summary" text DEFAULT '' NOT NULL,
	"logo_url" text,
	"wikidata_id" text,
	"linkedin_url" text,
	"glassdoor_url" text,
	"glassdoor_rating" numeric(3, 2),
	"glassdoor_review_count" integer,
	"glassdoor_recommend_pct" smallint,
	"glassdoor_ceo_approval_pct" smallint,
	"glassdoor_top_pro" text,
	"glassdoor_top_con" text,
	"glassdoor_synced_at" timestamp,
	"has_recent_layoff" boolean DEFAULT false NOT NULL,
	"last_layoff_at" timestamp,
	"last_layoff_count" integer,
	"enrichment_synced_at" timestamp,
	"raw_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "company_benefits" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"category" varchar(64) NOT NULL,
	"description" text NOT NULL,
	"value_text" text,
	"source" varchar(64),
	"raw_json" jsonb,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "company_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"kind" "company_connection_kind" NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"headline" text,
	"linkedin_url" text,
	"shared_school" text,
	"raw_json" jsonb,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "company_fit_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"score" smallint NOT NULL,
	"breakdown_json" jsonb NOT NULL,
	"computed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "company_fit_scores_company_id_unique" UNIQUE("company_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "company_layoffs" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"affected_count" integer,
	"percent_of_workforce" numeric(5, 2),
	"announced_at" timestamp NOT NULL,
	"source_url" text,
	"summary" text DEFAULT '' NOT NULL,
	"raw_json" jsonb,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "company_news" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"kind" "company_news_kind" DEFAULT 'news' NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"url" text,
	"source" varchar(64),
	"published_at" timestamp,
	"raw_json" jsonb,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "company_offices" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"address" text,
	"lat" double precision,
	"lng" double precision,
	"amenities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "company_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"source" "company_review_source" NOT NULL,
	"title" text,
	"body" text DEFAULT '' NOT NULL,
	"rating" numeric(3, 2),
	"pros" text,
	"cons" text,
	"role" text,
	"posted_at" timestamp,
	"raw_json" jsonb,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cover_letter_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"body_md" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cover_letters" (
	"id" serial PRIMARY KEY NOT NULL,
	"application_id" integer NOT NULL,
	"template_id" integer,
	"provider" "llm_provider" NOT NULL,
	"generated_md" text NOT NULL,
	"pdf_path" text,
	"theme" text DEFAULT 'modern' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cv_master" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text DEFAULT 'My CV' NOT NULL,
	"raw_markdown" text NOT NULL,
	"parsed_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_file_path" text,
	"is_active" boolean DEFAULT false NOT NULL,
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
	"theme" text DEFAULT 'modern' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "flashcards" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"category" "flashcard_category" NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"provider" "llm_provider" NOT NULL,
	"order_idx" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "interview_feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"application_id" integer NOT NULL,
	"interview_id" integer,
	"source" "feedback_source" DEFAULT 'self' NOT NULL,
	"rejection_category" "rejection_category",
	"rating" integer,
	"what_went_well_md" text DEFAULT '' NOT NULL,
	"what_went_badly_md" text DEFAULT '' NOT NULL,
	"what_to_change_md" text DEFAULT '' NOT NULL,
	"recruiter_verbatim" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "interviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"application_id" integer NOT NULL,
	"scheduled_at" timestamp NOT NULL,
	"duration_min" integer DEFAULT 45 NOT NULL,
	"type" "interview_type" DEFAULT 'phone' NOT NULL,
	"status" "interview_status" DEFAULT 'scheduled' NOT NULL,
	"interviewer_name" text,
	"interviewer_title" text,
	"meeting_url" text,
	"location_text" text,
	"prep_notes_md" text DEFAULT '' NOT NULL,
	"post_notes_md" text DEFAULT '' NOT NULL,
	"reminder_sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
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
	"cached_at" timestamp DEFAULT now() NOT NULL,
	"dedupe_hash" text,
	"sources_seen" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	"top_score" smallint,
	"search_profile_id" integer,
	"company_id" integer,
	"fit_overall_score" smallint,
	"fit_scored_at" timestamp,
	"distance_km" smallint,
	"distance_scored_at" timestamp,
	"hidden" boolean DEFAULT false NOT NULL
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
CREATE TABLE IF NOT EXISTS "portfolio_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" "portfolio_kind" NOT NULL,
	"source_key" text NOT NULL,
	"external_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"url" text,
	"tech" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"highlights" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"role" text,
	"started_at" timestamp,
	"ended_at" timestamp,
	"stars" integer,
	"hidden" boolean DEFAULT false NOT NULL,
	"raw_json" jsonb,
	"synced_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
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
	"home_address" text,
	"home_lat" double precision,
	"home_lng" double precision,
	"home_geocoded_at" timestamp,
	"salary_target_min" integer,
	"salary_target_max" integer,
	"salary_target_currency" varchar(8),
	"salary_target_period" varchar(16),
	"work_mode_preference" varchar(16),
	"max_office_days_per_week" smallint,
	"culture_likes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"culture_avoids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"max_commute_minutes" smallint,
	"preferred_transport_mode" varchar(16),
	"benefit_priorities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"skill_overrides" jsonb DEFAULT '{"matched":[],"missing":[]}'::jsonb NOT NULL,
	"right_to_work" jsonb DEFAULT '{"zones":[],"evidence":{},"freeText":""}'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
	"companies" jsonb DEFAULT '[]'::jsonb NOT NULL,
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
DO $$ BEGIN
 ALTER TABLE "applications" ADD CONSTRAINT "applications_job_id_job_listings_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job_listings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "canonical_gap_resources" ADD CONSTRAINT "canonical_gap_resources_canonical_gap_id_canonical_gaps_id_fk" FOREIGN KEY ("canonical_gap_id") REFERENCES "public"."canonical_gaps"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "canonical_gap_sources" ADD CONSTRAINT "canonical_gap_sources_canonical_gap_id_canonical_gaps_id_fk" FOREIGN KEY ("canonical_gap_id") REFERENCES "public"."canonical_gaps"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "canonical_gap_sources" ADD CONSTRAINT "canonical_gap_sources_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "company_benefits" ADD CONSTRAINT "company_benefits_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "company_connections" ADD CONSTRAINT "company_connections_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "company_fit_scores" ADD CONSTRAINT "company_fit_scores_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "company_layoffs" ADD CONSTRAINT "company_layoffs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "company_news" ADD CONSTRAINT "company_news_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "company_offices" ADD CONSTRAINT "company_offices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "company_reviews" ADD CONSTRAINT "company_reviews_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cover_letters" ADD CONSTRAINT "cover_letters_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cover_letters" ADD CONSTRAINT "cover_letters_template_id_cover_letter_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."cover_letter_templates"("id") ON DELETE set null ON UPDATE no action;
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
 ALTER TABLE "flashcards" ADD CONSTRAINT "flashcards_job_id_job_listings_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job_listings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "interview_feedback" ADD CONSTRAINT "interview_feedback_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "interview_feedback" ADD CONSTRAINT "interview_feedback_interview_id_interviews_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interviews"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "interviews" ADD CONSTRAINT "interviews_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_listings" ADD CONSTRAINT "job_listings_search_profile_id_search_profiles_id_fk" FOREIGN KEY ("search_profile_id") REFERENCES "public"."search_profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_listings" ADD CONSTRAINT "job_listings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;
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
DO $$ BEGIN
 ALTER TABLE "search_runs" ADD CONSTRAINT "search_runs_profile_id_search_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."search_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "canonical_gap_resources_gap_idx" ON "canonical_gap_resources" USING btree ("canonical_gap_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "canonical_gap_sources_uniq_idx" ON "canonical_gap_sources" USING btree ("canonical_gap_id","match_id","raw_phrase");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "canonical_gap_sources_gap_idx" ON "canonical_gap_sources" USING btree ("canonical_gap_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "canonical_gaps_normalized_key_idx" ON "canonical_gaps" USING btree ("normalized_key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "companies_slug_idx" ON "companies" USING btree ("slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_benefits_company_idx" ON "company_benefits" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_connections_company_idx" ON "company_connections" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_layoffs_company_idx" ON "company_layoffs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_layoffs_announced_idx" ON "company_layoffs" USING btree ("announced_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_news_company_idx" ON "company_news" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_news_published_idx" ON "company_news" USING btree ("published_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_offices_company_idx" ON "company_offices" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_reviews_company_idx" ON "company_reviews" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_reviews_source_idx" ON "company_reviews" USING btree ("source");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cv_master_one_active_idx" ON "cv_master" USING btree ("is_active") WHERE "cv_master"."is_active" = true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "flashcards_job_idx" ON "flashcards" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interviews_app_idx" ON "interviews" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interviews_scheduled_idx" ON "interviews" USING btree ("scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "job_listings_external_idx" ON "job_listings" USING btree ("source","external_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_listings_title_idx" ON "job_listings" USING btree ("title");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_listings_feed_idx" ON "job_listings" USING btree ("top_score" DESC NULLS LAST,"fetched_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_listings_dedupe_idx" ON "job_listings" USING btree ("dedupe_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_listings_fetched_idx" ON "job_listings" USING btree ("fetched_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_listings_profile_idx" ON "job_listings" USING btree ("search_profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "portfolio_items_uniq_idx" ON "portfolio_items" USING btree ("source_key","external_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portfolio_items_kind_idx" ON "portfolio_items" USING btree ("kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portfolio_items_synced_idx" ON "portfolio_items" USING btree ("synced_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "search_profiles_due_idx" ON "search_profiles" USING btree ("active","next_run_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "search_runs_profile_idx" ON "search_runs" USING btree ("profile_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "search_runs_status_idx" ON "search_runs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "source_budgets_uniq_month_idx" ON "source_budgets" USING btree ("source","month_year");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "source_quotas_daily_uniq_idx" ON "source_quotas_daily" USING btree ("source","day");