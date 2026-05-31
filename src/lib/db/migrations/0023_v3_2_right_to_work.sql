-- v3.2 — right-to-work declaration on the profile.
--
-- zones: canonical short keys (US, UK, EU, CA, AU, IN, NZ, MENA, OTHER)
-- evidence: per-zone free-text notes ("British citizen", "Settled status",
--           "TN visa", "OPT until 2027")
-- freeText: catch-all for anything else
--
-- Used by:
--   - /jobs filter `?rtw=mine` — hides roles whose location is outside
--     declared zones (Unknown-zone listings stay visible — false
--     negatives are worse than seeing one extra row)
--   - /profile editor — user-facing surface
--
-- Default is an empty declaration so existing rows behave as if no filter
-- is set.

ALTER TABLE "profile"
  ADD COLUMN IF NOT EXISTS "right_to_work" jsonb
  NOT NULL DEFAULT '{"zones":[],"evidence":{},"freeText":""}'::jsonb;
