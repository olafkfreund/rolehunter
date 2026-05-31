-- v3.2 — soft-delete / hide flag for job_listings. Mirrors
-- portfolio_items.hidden. Hidden rows are excluded from /jobs by default
-- and from the dashboard's "top scored roles" pick. The user can still
-- see them via /jobs?band=hidden. Hard-delete (DELETE /api/jobs/[id])
-- remains available for permanent removal.

ALTER TABLE "job_listings" ADD COLUMN IF NOT EXISTS "hidden" boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "job_listings_hidden_idx" ON "job_listings" ("hidden") WHERE NOT "hidden";
