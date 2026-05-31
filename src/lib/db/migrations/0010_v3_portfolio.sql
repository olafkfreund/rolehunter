CREATE TYPE "public"."portfolio_kind" AS ENUM('github_repo', 'gitlab_repo', 'blog_post', 'website', 'obsidian_note', 'manual_project', 'manual_skill', 'manual_role');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "portfolio_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" "portfolio_kind" NOT NULL,
	"source_key" text NOT NULL,
	"external_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL DEFAULT '',
	"url" text,
	"tech" jsonb NOT NULL DEFAULT '[]'::jsonb,
	"highlights" jsonb NOT NULL DEFAULT '[]'::jsonb,
	"role" text,
	"started_at" timestamp,
	"ended_at" timestamp,
	"stars" integer,
	"hidden" boolean NOT NULL DEFAULT false,
	"raw_json" jsonb,
	"synced_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "portfolio_items_uniq_idx" ON "portfolio_items" ("source_key", "external_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portfolio_items_kind_idx" ON "portfolio_items" ("kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portfolio_items_synced_idx" ON "portfolio_items" ("synced_at" DESC NULLS LAST);
