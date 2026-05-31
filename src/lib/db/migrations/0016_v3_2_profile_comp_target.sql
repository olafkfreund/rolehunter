-- v3.2 — capture user's target compensation band on the profile so the
-- role-fit dashboard's Compensation dimension can score JD salary bands
-- against the user's target instead of just surfacing a readout.

ALTER TABLE "profile" ADD COLUMN IF NOT EXISTS "salary_target_min" integer;
ALTER TABLE "profile" ADD COLUMN IF NOT EXISTS "salary_target_max" integer;
ALTER TABLE "profile" ADD COLUMN IF NOT EXISTS "salary_target_currency" varchar(8);
ALTER TABLE "profile" ADD COLUMN IF NOT EXISTS "salary_target_period" varchar(16);
