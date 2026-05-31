// Boot-time hydrate of process.env from the app_settings table.
// Runs once per worker via the Next.js instrumentation register() hook.
// Only fills keys that are empty in process.env — explicit .env values still
// win (so a deployment-time secret manager remains authoritative if used).

import { getDb, schema } from "@/lib/db";
import { EDITABLE_KEYS } from "./runtime";

export async function hydrateProcessEnvFromDb(): Promise<void> {
  const db = getDb();
  const rows = await db.select().from(schema.appSettings);
  const dbMap = new Map(rows.map((r) => [r.key, r.value]));

  let hydratedCount = 0;
  for (const key of EDITABLE_KEYS) {
    const fromEnv = process.env[key];
    const fromDb = dbMap.get(key);
    if ((!fromEnv || fromEnv === "") && fromDb && fromDb !== "") {
      process.env[key] = fromDb;
      hydratedCount++;
    }
  }
  if (hydratedCount > 0) {
    console.log(`[settings] hydrated ${hydratedCount} setting(s) from app_settings`);
  }
}
