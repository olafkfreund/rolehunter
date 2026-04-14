CREATE TYPE "public"."gap_learning_status" AS ENUM('to_learn', 'learning', 'done', 'dismissed');--> statement-breakpoint
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
CREATE INDEX IF NOT EXISTS "canonical_gap_resources_gap_idx" ON "canonical_gap_resources" USING btree ("canonical_gap_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "canonical_gap_sources_uniq_idx" ON "canonical_gap_sources" USING btree ("canonical_gap_id","match_id","raw_phrase");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "canonical_gap_sources_gap_idx" ON "canonical_gap_sources" USING btree ("canonical_gap_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "canonical_gaps_normalized_key_idx" ON "canonical_gaps" USING btree ("normalized_key");