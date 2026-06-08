import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  ANTHROPIC_API_KEY: z.string().optional().default(""),
  GEMINI_API_KEY: z.string().optional().default(""),
  JSEARCH_RAPIDAPI_KEY: z.string().optional().default(""),
  LINKEDIN_RAPIDAPI_HOST: z.string().default("linkedin-job-search-api.p.rapidapi.com"),
  ADZUNA_APP_ID: z.string().optional().default(""),
  ADZUNA_APP_KEY: z.string().optional().default(""),
  ADZUNA_DEFAULT_COUNTRY: z
    .enum(["gb", "us", "au", "br", "ca", "de", "fr", "in", "it", "mx", "nl", "nz", "pl", "ru", "sg", "za"])
    .default("gb"),
  // v3.0 Apify on-demand (#35)
  APIFY_API_TOKEN: z.string().optional().default(""),
  APIFY_LINKEDIN_ACTOR_ID: z.string().optional().default(""),
  APIFY_GLASSDOOR_ACTOR_ID: z.string().optional().default(""),
  // v3.2 (#43 final-stretch) — extra Apify actors for company enrichment
  APIFY_LEVELS_FYI_ACTOR_ID: z.string().optional().default(""),
  APIFY_LAYOFFS_ACTOR_ID: z.string().optional().default(""),
  APIFY_LINKEDIN_COMPANY_ACTOR_ID: z.string().optional().default(""),
  APIFY_USD_PER_RUN_ESTIMATE: z.string().optional().default(""),
  // v3.2 (#43) — Google Maps Distance Matrix for real commute time + cost
  GOOGLE_MAPS_API_KEY: z.string().optional().default(""),
  BUDGET_APIFY_USD_MONTHLY: z.coerce.number().min(0).default(5),
  DEFAULT_LLM_PROVIDER: z.enum(["claude", "gemini", "openai", "ollama"]).default("claude"),
  CLAUDE_MODEL: z.string().default("claude-sonnet-4-6"),
  GEMINI_MODEL: z.string().default("gemini-2.5-pro"),
  // v3.0 LLM provider expansion (#47)
  OPENAI_API_KEY: z.string().optional().default(""),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  OLLAMA_BASE_URL: z.string().default("http://localhost:11434"),
  OLLAMA_MODEL: z.string().default("llama3.1:8b"),
  AUTO_SCORE_PROVIDER: z.string().optional().default(""),
  MATCH_PROVIDER: z.string().optional().default(""),
  CV_REWRITE_PROVIDER: z.string().optional().default(""),
  COVER_LETTER_PROVIDER: z.string().optional().default(""),
  FLASHCARDS_PROVIDER: z.string().optional().default(""),
  GAPS_PROVIDER: z.string().optional().default(""),
  LINKEDIN_IMPORT_PROVIDER: z.string().optional().default(""),
  LINKEDIN_SEO_PROVIDER: z.string().optional().default(""),
  LEARN_RESOURCES_PROVIDER: z.string().optional().default(""),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  UPLOAD_DIR: z.string().default("/app/uploads"),
  // v3.0 scheduler
  ENABLE_SCHEDULER: z.string().optional().default(""),
  SCHEDULER_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(10),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid env: ${parsed.error.message}`);
  }
  cached = parsed.data;
  return cached;
}

export function invalidateEnvCache(): void {
  cached = null;
}

export function hasProvider(p: "claude" | "gemini" | "openai" | "ollama"): boolean {
  const env = getEnv();
  switch (p) {
    case "claude":
      return !!env.ANTHROPIC_API_KEY;
    case "gemini":
      return !!env.GEMINI_API_KEY;
    case "openai":
      return !!env.OPENAI_API_KEY;
    case "ollama":
      // Sync check: if the user has set OLLAMA_BASE_URL explicitly (or kept the
      // default and intends to run it), treat ollama as available. Real
      // unreachability surfaces at call time as a transient error and the
      // caller (or the fallback chain via try/catch) handles it.
      return !!env.OLLAMA_BASE_URL;
  }
}
