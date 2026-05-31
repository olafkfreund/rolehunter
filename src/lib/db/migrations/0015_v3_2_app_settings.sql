-- v3.2 slice 4 — runtime-editable settings.
-- Key/value store so the Docker image can be configured from the UI
-- (first-run wizard + /settings page) instead of requiring .env edits.

CREATE TABLE IF NOT EXISTS "app_settings" (
    "key" text PRIMARY KEY NOT NULL,
    "value" text NOT NULL,
    "is_secret" boolean NOT NULL DEFAULT false,
    "description" text,
    "updated_at" timestamp DEFAULT NOW() NOT NULL
);
