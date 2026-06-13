CREATE TABLE IF NOT EXISTS "company_ats" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"ats" text,
	"slug" text,
	"resolved" boolean DEFAULT false NOT NULL,
	"checked_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "company_ats_name_idx" ON "company_ats" USING btree ("name");