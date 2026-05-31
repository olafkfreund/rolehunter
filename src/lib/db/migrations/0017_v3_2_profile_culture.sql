-- v3.2 — capture user's culture preferences so the role-fit dashboard's
-- Culture dimension scores against what they actually want, not just what
-- the JD happens to mention.
--
-- work_mode_preference ∈ {remote, hybrid, onsite, any}. "any" = no penalty.
-- culture_likes / culture_avoids are arrays of keyword keys matching the
-- CULTURE_KEYWORDS vocabulary in src/lib/jobs/fit-score.ts.

ALTER TABLE "profile" ADD COLUMN IF NOT EXISTS "work_mode_preference" varchar(16);
ALTER TABLE "profile" ADD COLUMN IF NOT EXISTS "max_office_days_per_week" smallint;
ALTER TABLE "profile" ADD COLUMN IF NOT EXISTS "culture_likes" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "profile" ADD COLUMN IF NOT EXISTS "culture_avoids" jsonb NOT NULL DEFAULT '[]'::jsonb;
