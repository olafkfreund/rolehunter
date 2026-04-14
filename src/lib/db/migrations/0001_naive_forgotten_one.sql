CREATE TYPE "public"."feedback_source" AS ENUM('recruiter', 'self', 'llm_synthesis');--> statement-breakpoint
CREATE TYPE "public"."flashcard_category" AS ENUM('behavioral', 'role_specific', 'company_specific', 'technical');--> statement-breakpoint
CREATE TYPE "public"."interview_status" AS ENUM('scheduled', 'completed', 'cancelled', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."interview_type" AS ENUM('phone', 'video', 'onsite', 'take_home', 'technical', 'system_design', 'behavioral', 'final');--> statement-breakpoint
CREATE TYPE "public"."rejection_category" AS ENUM('resume_screen', 'technical', 'behavioral', 'culture', 'salary', 'position_closed', 'other');--> statement-breakpoint
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
ALTER TABLE "cv_master" ADD COLUMN "is_active" boolean DEFAULT false NOT NULL;--> statement-breakpoint
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
CREATE INDEX IF NOT EXISTS "flashcards_job_idx" ON "flashcards" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interviews_app_idx" ON "interviews" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interviews_scheduled_idx" ON "interviews" USING btree ("scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cv_master_one_active_idx" ON "cv_master" USING btree ("is_active") WHERE "cv_master"."is_active" = true;--> statement-breakpoint
-- Backfill: mark the newest existing CV (if any) as active.
UPDATE "cv_master" SET "is_active" = true
WHERE "id" = (SELECT "id" FROM "cv_master" ORDER BY "uploaded_at" DESC LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM "cv_master" WHERE "is_active" = true);
