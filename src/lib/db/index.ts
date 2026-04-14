import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getEnv } from "../env";
import * as schema from "./schema";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _pool: Pool | null = null;

export function getDb() {
  if (_db) return _db;
  const env = getEnv();
  _pool = new Pool({ connectionString: env.DATABASE_URL, max: 10 });
  _db = drizzle(_pool, { schema });
  return _db;
}

export { schema };
