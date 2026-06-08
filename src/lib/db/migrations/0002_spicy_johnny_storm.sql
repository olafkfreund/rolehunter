ALTER TABLE "cover_letters" ADD COLUMN "selected_hook" text;--> statement-breakpoint
ALTER TABLE "cover_letters" ADD COLUMN "selected_evidence" jsonb;--> statement-breakpoint
ALTER TABLE "cover_letters" ADD COLUMN "cta_tone" text;