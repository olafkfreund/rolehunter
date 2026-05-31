-- v3.2 epic #43 slice 2 — geocode company headquarters for distance display.
-- Populated by the Nominatim helper during /api/companies/enrich after
-- Wikidata returns the HQ label.

ALTER TABLE "companies"
    ADD COLUMN IF NOT EXISTS "hq_lat" double precision;

ALTER TABLE "companies"
    ADD COLUMN IF NOT EXISTS "hq_lng" double precision;

ALTER TABLE "companies"
    ADD COLUMN IF NOT EXISTS "hq_geocoded_at" timestamp;
