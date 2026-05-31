-- v3.2 — per-user skill overrides for the role-fit dashboard.
--
-- Profile-level (not per-job) because "I know Java" is a fact about the
-- user that applies to every job mentioning Java. Two arrays of lowercase
-- tokens: `matched` and `missing`. The classifier consults these AFTER its
-- CV/portfolio resolution so the user can correct mis-classified chips.
--
-- Example payload:
--   { "matched": ["java", "solid", "datadog"], "missing": ["graphql"] }

ALTER TABLE "profile"
  ADD COLUMN IF NOT EXISTS "skill_overrides" jsonb
  NOT NULL DEFAULT '{"matched":[],"missing":[]}'::jsonb;
