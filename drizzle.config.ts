import type { Config } from "drizzle-kit";

export default {
  schema: "./src/lib/db/schema.ts",
  out: "./src/lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://rolehunter:rolehunter@localhost:5432/rolehunter",
  },
  strict: true,
  verbose: true,
} satisfies Config;
