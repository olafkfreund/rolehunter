import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  ANTHROPIC_API_KEY: z.string().optional().default(""),
  GEMINI_API_KEY: z.string().optional().default(""),
  JSEARCH_RAPIDAPI_KEY: z.string().optional().default(""),
  LINKEDIN_RAPIDAPI_HOST: z.string().default("linkedin-job-search-api.p.rapidapi.com"),
  DEFAULT_LLM_PROVIDER: z.enum(["claude", "gemini"]).default("claude"),
  CLAUDE_MODEL: z.string().default("claude-sonnet-4-6"),
  GEMINI_MODEL: z.string().default("gemini-2.5-pro"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  UPLOAD_DIR: z.string().default("/app/uploads"),
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

export function hasProvider(p: "claude" | "gemini"): boolean {
  const env = getEnv();
  return p === "claude" ? !!env.ANTHROPIC_API_KEY : !!env.GEMINI_API_KEY;
}
