CREATE TYPE "public"."application_priority" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "priority" "application_priority" DEFAULT 'medium' NOT NULL;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "last_contact" timestamp;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "excitement" integer;