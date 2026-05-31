-- v3.2 epic #43 slice 1 — capture user's home address for commute calcs.
-- Geocoded via OpenStreetMap Nominatim on save (free, no key).
-- Commute time/cost via Google Maps Distance Matrix arrives in slice 2 ($).

ALTER TABLE "profile"
    ADD COLUMN IF NOT EXISTS "home_address" text;

ALTER TABLE "profile"
    ADD COLUMN IF NOT EXISTS "home_lat" double precision;

ALTER TABLE "profile"
    ADD COLUMN IF NOT EXISTS "home_lng" double precision;

ALTER TABLE "profile"
    ADD COLUMN IF NOT EXISTS "home_geocoded_at" timestamp;
