// LLM provider resolution. Two call shapes supported:
//
//   getProvider()                  — uses DEFAULT_LLM_PROVIDER + fallback chain
//   getProvider("claude")          — explicit provider; falls through chain if
//                                    requested isn't configured
//   getProvider("auto_score")      — looks up AUTO_SCORE_PROVIDER env, then
//                                    DEFAULT_LLM_PROVIDER, then fallback chain
//
// Fallback chain order: requested -> default -> claude -> gemini -> openai -> ollama.
// Each candidate is gated by hasProvider() (env-key check; for ollama, just
// OLLAMA_BASE_URL set).
//
// See doc/plans/2026-05-31-rolehunter-v3-design.md §12.

import { claudeProvider } from "./claude";
import { geminiProvider } from "./gemini";
import { ollamaProvider } from "./ollama";
import { openaiProvider } from "./openai";
import type { LlmProvider, Provider } from "./types";
import { getEnv, hasProvider } from "../env";

export type LlmTaskKey =
  | "auto_score"
  | "match"
  | "cv_rewrite"
  | "cover_letter"
  | "flashcards"
  | "gaps"
  | "linkedin_import"
  | "linkedin_seo"
  | "learn_resources";

const TASK_ENV: Record<LlmTaskKey, keyof ReturnType<typeof getEnv>> = {
  auto_score: "AUTO_SCORE_PROVIDER",
  match: "MATCH_PROVIDER",
  cv_rewrite: "CV_REWRITE_PROVIDER",
  cover_letter: "COVER_LETTER_PROVIDER",
  flashcards: "FLASHCARDS_PROVIDER",
  gaps: "GAPS_PROVIDER",
  linkedin_import: "LINKEDIN_IMPORT_PROVIDER",
  linkedin_seo: "LINKEDIN_SEO_PROVIDER",
  learn_resources: "LEARN_RESOURCES_PROVIDER",
};

const ALL_PROVIDERS: Provider[] = ["claude", "gemini", "openai", "ollama"];

function isProvider(v: unknown): v is Provider {
  return typeof v === "string" && (ALL_PROVIDERS as string[]).includes(v);
}

function isTaskKey(v: unknown): v is LlmTaskKey {
  return typeof v === "string" && v in TASK_ENV;
}

function providerInstance(p: Provider): LlmProvider {
  switch (p) {
    case "claude":
      return claudeProvider;
    case "gemini":
      return geminiProvider;
    case "openai":
      return openaiProvider;
    case "ollama":
      return ollamaProvider;
  }
}

/**
 * Resolve to the first available provider in: requested -> default -> chain.
 * Throws only if nothing in the chain is configured.
 */
function resolveProvider(requested: Provider | null): LlmProvider {
  const env = getEnv();
  const order: Provider[] = [];
  if (requested) order.push(requested);
  if (env.DEFAULT_LLM_PROVIDER && env.DEFAULT_LLM_PROVIDER !== requested) {
    order.push(env.DEFAULT_LLM_PROVIDER);
  }
  for (const p of ALL_PROVIDERS) {
    if (!order.includes(p)) order.push(p);
  }
  for (const p of order) {
    if (hasProvider(p)) return providerInstance(p);
  }
  throw new Error(
    "No LLM provider configured. Set ANTHROPIC_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY, or OLLAMA_BASE_URL.",
  );
}

export function getProvider(taskOrProvider?: Provider | LlmTaskKey | null): LlmProvider {
  if (!taskOrProvider) {
    return resolveProvider(null);
  }
  if (isProvider(taskOrProvider)) {
    return resolveProvider(taskOrProvider);
  }
  if (isTaskKey(taskOrProvider)) {
    const env = getEnv();
    const envValue = env[TASK_ENV[taskOrProvider]];
    if (isProvider(envValue)) {
      return resolveProvider(envValue);
    }
    return resolveProvider(null);
  }
  // Unknown string (defensive): fall back to default.
  console.warn(`[llm] unknown provider/task key '${String(taskOrProvider)}'; using DEFAULT_LLM_PROVIDER`);
  return resolveProvider(null);
}

export type { LlmProvider, Provider } from "./types";
export * from "./types";
