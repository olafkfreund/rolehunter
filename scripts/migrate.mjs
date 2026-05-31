// scripts/migrate.mjs — apply Drizzle migrations using the same node-postgres
// driver the app uses. Runs in the production image without drizzle-kit (which
// pulls esbuild and is not shipped in the runner). Idempotent: already-applied
// migrations are skipped via the drizzle.__drizzle_migrations journal.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const migrationsFolder = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "lib",
  "db",
  "migrations",
);

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });

try {
  await migrate(drizzle(pool), { migrationsFolder });
  console.log("Migrations up to date.");
} catch (err) {
  console.error("Migration failed:", err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
