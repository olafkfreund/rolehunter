ALTER TABLE "search_profiles" ADD COLUMN IF NOT EXISTS "companies" jsonb NOT NULL DEFAULT '[]'::jsonb;
