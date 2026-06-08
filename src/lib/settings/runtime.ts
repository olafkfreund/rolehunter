// Runtime-editable settings backed by the `app_settings` DB table.
// Read order: app_settings → process.env → undefined.
// Used by: LLM provider key resolution, Apify token resolution, defaults.
//
// All writes go through setRuntimeSetting() so the in-memory cache stays
// consistent with the DB.

import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { invalidateEnvCache } from "@/lib/env";

export const EDITABLE_KEYS = [
  "ANTHROPIC_API_KEY",
  "CLAUDE_MODEL",
  "GEMINI_API_KEY",
  "GEMINI_MODEL",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "OLLAMA_BASE_URL",
  "OLLAMA_MODEL",
  "JSEARCH_RAPIDAPI_KEY",
  "ADZUNA_APP_ID",
  "ADZUNA_APP_KEY",
  "APIFY_API_TOKEN",
  "APIFY_GLASSDOOR_ACTOR_ID",
  "DEFAULT_LLM_PROVIDER",
] as const;
export type EditableKey = (typeof EDITABLE_KEYS)[number];

export const SECRET_KEYS = new Set<EditableKey>([
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "OPENAI_API_KEY",
  "JSEARCH_RAPIDAPI_KEY",
  "ADZUNA_APP_KEY",
  "APIFY_API_TOKEN",
]);

interface KeyMeta {
  label: string;
  description: string;
  placeholder?: string;
  validate?: (v: string) => string | null; // returns error message or null
}

export const KEY_META: Record<EditableKey, KeyMeta> = {
  ANTHROPIC_API_KEY: {
    label: "Anthropic API key",
    description: "Get one at console.anthropic.com. Used for Claude provider.",
    placeholder: "sk-ant-api03-…",
    validate: (v) => (v && !v.startsWith("sk-ant-") ? "Should start with sk-ant-" : null),
  },
  CLAUDE_MODEL: {
    label: "Claude model",
    description: "The model ID to use for Anthropic Claude (e.g. claude-sonnet-4-6).",
    placeholder: "claude-sonnet-4-6",
  },
  GEMINI_API_KEY: {
    label: "Google Gemini API key",
    description: "Get one at aistudio.google.com/apikey. Used for Gemini provider.",
    placeholder: "AIza…",
  },
  GEMINI_MODEL: {
    label: "Gemini model",
    description: "The model ID to use for Google Gemini (e.g. gemini-2.5-pro).",
    placeholder: "gemini-2.5-pro",
  },
  OPENAI_API_KEY: {
    label: "OpenAI API key",
    description: "Get one at platform.openai.com/api-keys. Used for OpenAI GPT provider.",
    placeholder: "sk-proj-…",
    validate: (v) => (v && !v.startsWith("sk-") ? "Should start with sk-" : null),
  },
  OPENAI_MODEL: {
    label: "OpenAI model",
    description: "The model ID to use for OpenAI GPT (e.g. gpt-4o-mini).",
    placeholder: "gpt-4o-mini",
  },
  OLLAMA_BASE_URL: {
    label: "Ollama base URL",
    description: "HTTP endpoint where your local Ollama instance runs.",
    placeholder: "http://localhost:11434",
  },
  OLLAMA_MODEL: {
    label: "Ollama model",
    description: "The local model name downloaded in your Ollama (e.g. llama3.1:8b).",
    placeholder: "llama3.1:8b",
  },
  JSEARCH_RAPIDAPI_KEY: {
    label: "JSearch RapidAPI key",
    description: "Your RapidAPI key for the JSearch API (used to fetch job listings).",
    placeholder: "3d79a7…",
  },
  ADZUNA_APP_ID: {
    label: "Adzuna App ID",
    description: "App ID from developer.adzuna.com for job searching.",
    placeholder: "3cf4665d",
  },
  ADZUNA_APP_KEY: {
    label: "Adzuna App Key",
    description: "App Key from developer.adzuna.com for job searching.",
    placeholder: "2235d78…",
  },
  APIFY_API_TOKEN: {
    label: "Apify API token",
    description:
      "Get one at console.apify.com/account#/integrations. Powers on-demand LinkedIn + Glassdoor scraping.",
    placeholder: "apify_api_…",
    validate: (v) => (v && !v.startsWith("apify_api_") ? "Should start with apify_api_" : null),
  },
  APIFY_GLASSDOOR_ACTOR_ID: {
    label: "Apify Glassdoor actor ID",
    description:
      "Pick a Glassdoor scraper at apify.com/store?search=glassdoor. Format: username~actor-name.",
    placeholder: "username~glassdoor-scraper",
  },
  DEFAULT_LLM_PROVIDER: {
    label: "Default LLM provider",
    description:
      "Used when a task has no specific override set. One of: claude, gemini, openai, ollama.",
    placeholder: "claude",
    validate: (v) =>
      v && !["claude", "gemini", "openai", "ollama"].includes(v)
        ? "Must be claude, gemini, openai, or ollama"
        : null,
  },
};

// Tiny in-process cache. Invalidated on every write. Short TTL on reads to
// avoid hammering the DB but also reflect another container's writes within
// a few seconds in case of horizontal scaling (not used today, but cheap).
const CACHE_TTL_MS = 5_000;
let cache: Map<string, { value: string; expires: number }> = new Map();

export function invalidateRuntimeSettings(): void {
  cache = new Map();
}

async function readFromDb(key: string): Promise<string | undefined> {
  const db = getDb();
  const rows = await db
    .select({ value: schema.appSettings.value })
    .from(schema.appSettings)
    .where(eq(schema.appSettings.key, key))
    .limit(1);
  return rows[0]?.value;
}

/**
 * Get a setting. Reads from app_settings if present, falls back to process.env,
 * else returns undefined. Always check === undefined, not falsy — empty string
 * is a valid "explicitly unset" value.
 */
export async function getRuntimeSetting(key: string): Promise<string | undefined> {
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;

  const fromDb = await readFromDb(key);
  if (fromDb !== undefined) {
    cache.set(key, { value: fromDb, expires: Date.now() + CACHE_TTL_MS });
    return fromDb;
  }
  const fromEnv = process.env[key];
  if (fromEnv !== undefined && fromEnv !== "") {
    cache.set(key, { value: fromEnv, expires: Date.now() + CACHE_TTL_MS });
    return fromEnv;
  }
  return undefined;
}

export interface SettingState {
  key: EditableKey;
  label: string;
  description: string;
  placeholder?: string;
  isSecret: boolean;
  hasValue: boolean;
  source: "db" | "env" | "unset";
  masked: string;
}

function maskSecret(value: string): string {
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

/**
 * Snapshot every editable setting with its current source + masked preview.
 * Used by the /settings UI and the wizard.
 */
export async function listSettingStates(): Promise<SettingState[]> {
  const states: SettingState[] = [];
  const db = getDb();
  const rows = await db.select().from(schema.appSettings);
  const dbMap = new Map(rows.map((r) => [r.key, r.value]));

  for (const key of EDITABLE_KEYS) {
    const meta = KEY_META[key];
    const isSecret = SECRET_KEYS.has(key);
    const dbValue = dbMap.get(key);
    const envValue = process.env[key];
    let source: "db" | "env" | "unset" = "unset";
    let value: string | undefined;
    if (dbValue !== undefined && dbValue !== "") {
      source = "db";
      value = dbValue;
    } else if (envValue !== undefined && envValue !== "") {
      source = "env";
      value = envValue;
    }
    let masked = "";
    if (value !== undefined) {
      masked = isSecret ? maskSecret(value) : value;
    }
    states.push({
      key,
      label: meta.label,
      description: meta.description,
      placeholder: meta.placeholder,
      isSecret,
      hasValue: value !== undefined,
      source,
      masked,
    });
  }
  return states;
}

export async function setRuntimeSetting(key: EditableKey, value: string): Promise<void> {
  const db = getDb();
  const isSecret = SECRET_KEYS.has(key);
  const meta = KEY_META[key];
  if (value === "") {
    // Empty string means "delete the DB row" — the env (if any) takes over again.
    await db.delete(schema.appSettings).where(eq(schema.appSettings.key, key));
    delete process.env[key];
  } else {
    await db
      .insert(schema.appSettings)
      .values({
        key,
        value,
        isSecret,
        description: meta.description,
      })
      .onConflictDoUpdate({
        target: schema.appSettings.key,
        set: { value, isSecret, updatedAt: new Date() },
      });
    process.env[key] = value;
  }
  // Force the caches to refresh on next read.
  invalidateRuntimeSettings();
  invalidateEnvCache();
}

/**
 * "Has the user completed initial setup?" — used by middleware to gate the
 * first-run wizard. Defines "configured" as: at least one LLM provider key
 * either in DB or in env.
 */
export async function isConfigured(): Promise<boolean> {
  for (const key of ["ANTHROPIC_API_KEY", "GEMINI_API_KEY", "OPENAI_API_KEY"] as const) {
    const v = await getRuntimeSetting(key);
    if (v && v.length > 0) return true;
  }
  const ollamaUrl = await getRuntimeSetting("OLLAMA_BASE_URL");
  if (ollamaUrl && ollamaUrl.length > 0) return true;
  return false;
}
