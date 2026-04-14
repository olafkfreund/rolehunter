import { claudeProvider } from "./claude";
import { geminiProvider } from "./gemini";
import type { LlmProvider, Provider } from "./types";
import { getEnv, hasProvider } from "../env";

export function getProvider(name?: Provider | null): LlmProvider {
  const requested = name ?? getEnv().DEFAULT_LLM_PROVIDER;
  if (requested === "claude") {
    if (!hasProvider("claude")) {
      if (hasProvider("gemini")) return geminiProvider;
      throw new Error("No LLM provider configured (ANTHROPIC_API_KEY or GEMINI_API_KEY).");
    }
    return claudeProvider;
  }
  if (!hasProvider("gemini")) {
    if (hasProvider("claude")) return claudeProvider;
    throw new Error("No LLM provider configured (ANTHROPIC_API_KEY or GEMINI_API_KEY).");
  }
  return geminiProvider;
}

export type { LlmProvider, Provider } from "./types";
export * from "./types";
