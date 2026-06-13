// Server-side aggregation of "what's configured?" state for the Settings page.
// Pulled together from env, profile, schedulers, budgets, providers. NEVER
// returns the actual secret values — only booleans/labels.

import { getEnv, hasProvider } from "@/lib/env";
import { getActiveCv } from "@/lib/repo/cv";
import { getProfile } from "@/lib/repo/profile";
import { listSources } from "@/lib/repo/portfolio";
import { listProfiles } from "@/lib/repo/searchProfiles";
import type { Provider } from "@/lib/llm";

export type Status = "ok" | "warn" | "missing";

export interface CheckRow {
  key: string;
  label: string;
  description: string;
  envVars: string[];
  status: Status;
  detail?: string;
}

export interface SettingsDiagnostics {
  jobSources: CheckRow[];
  llmProviders: {
    rows: CheckRow[];
    defaultProvider: Provider;
    perTask: Array<{ task: string; envVar: string; resolvedFromEnv: string | null }>;
  };
  portfolio: CheckRow[];
  companyIntel: CheckRow[];
  scheduler: {
    enabled: boolean;
    batchSize: number;
    sources: number;
  };
  budgets: {
    apifyMonthlyCapUsd: number;
    apifyConfigured: boolean;
  };
  profile: {
    fullName: string | null;
    email: string | null;
    location: string | null;
    hasLinkedinUrl: boolean;
    activeCvTitle: string | null;
  };
  uploadDir: string;
  portfolioSourceCount: number;
}

function bool(s: string | undefined | null): boolean {
  if (!s) return false;
  const v = s.toLowerCase().trim();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function row(
  key: string,
  label: string,
  description: string,
  envVars: string[],
  ok: boolean,
  detail?: string,
): CheckRow {
  return {
    key,
    label,
    description,
    envVars,
    status: ok ? "ok" : "missing",
    detail,
  };
}

export async function getDiagnostics(): Promise<SettingsDiagnostics> {
  const env = getEnv();

  const jobSources: CheckRow[] = [
    row(
      "jsearch",
      "JSearch (RapidAPI)",
      "Aggregated multi-board search via RapidAPI.",
      ["JSEARCH_RAPIDAPI_KEY"],
      !!env.JSEARCH_RAPIDAPI_KEY,
    ),
    row(
      "linkedin-rapidapi",
      "LinkedIn (RapidAPI)",
      "LinkedIn search-API host used by linkedin-jobs adapter.",
      ["JSEARCH_RAPIDAPI_KEY", "LINKEDIN_RAPIDAPI_HOST"],
      !!env.JSEARCH_RAPIDAPI_KEY && !!env.LINKEDIN_RAPIDAPI_HOST,
      env.LINKEDIN_RAPIDAPI_HOST,
    ),
    row(
      "adzuna",
      "Adzuna",
      "EU-friendly job aggregator. Free tier is generous.",
      ["ADZUNA_APP_ID", "ADZUNA_APP_KEY"],
      !!env.ADZUNA_APP_ID && !!env.ADZUNA_APP_KEY,
      `default country: ${env.ADZUNA_DEFAULT_COUNTRY}`,
    ),
    row(
      "apify",
      "Apify (LinkedIn / Glassdoor)",
      "On-demand actors. Capped monthly by BUDGET_APIFY_USD_MONTHLY.",
      ["APIFY_API_TOKEN", "APIFY_LINKEDIN_ACTOR_ID"],
      !!env.APIFY_API_TOKEN,
      env.APIFY_LINKEDIN_ACTOR_ID
        ? `actor: ${env.APIFY_LINKEDIN_ACTOR_ID}`
        : "no actor id set",
    ),
    row(
      "glassdoor",
      "Glassdoor (via Apify)",
      "On-demand Glassdoor job search. Capped monthly by BUDGET_APIFY_USD_MONTHLY.",
      ["APIFY_API_TOKEN", "APIFY_GLASSDOOR_JOBS_ACTOR_ID"],
      !!env.APIFY_API_TOKEN && !!env.APIFY_GLASSDOOR_JOBS_ACTOR_ID,
      env.APIFY_GLASSDOOR_JOBS_ACTOR_ID
        ? `actor: ${env.APIFY_GLASSDOOR_JOBS_ACTOR_ID}`
        : "no actor id set",
    ),
    row(
      "reed",
      "Reed.co.uk",
      "UK job board search via Reed Developer API.",
      ["REED_API_KEY"],
      !!env.REED_API_KEY,
    ),
    row(
      "ats-greenhouse",
      "Greenhouse (ATS)",
      "Public board scrape per company. No key required.",
      [],
      true,
    ),
    row(
      "ats-lever",
      "Lever (ATS)",
      "Public board scrape per company. No key required.",
      [],
      true,
    ),
    row(
      "ats-workday",
      "Workday (ATS)",
      "Public job-search endpoint per company. No key required.",
      [],
      true,
    ),
    row(
      "ats-workable",
      "Workable (ATS)",
      "Public account widget API per company. No key required.",
      [],
      true,
    ),
    row(
      "ats-ashby",
      "Ashby (ATS)",
      "Public job-board posting API per company. No key required.",
      [],
      true,
    ),
    row(
      "ats-smartrecruiters",
      "SmartRecruiters (ATS)",
      "Public postings API per company. No key required.",
      [],
      true,
    ),
  ];

  const providerInfo: Array<{ p: Provider; envVars: string[]; defaultModelKey: keyof typeof env }> =
    [
      { p: "claude", envVars: ["ANTHROPIC_API_KEY"], defaultModelKey: "CLAUDE_MODEL" },
      { p: "gemini", envVars: ["GEMINI_API_KEY"], defaultModelKey: "GEMINI_MODEL" },
      { p: "openai", envVars: ["OPENAI_API_KEY"], defaultModelKey: "OPENAI_MODEL" },
      { p: "ollama", envVars: ["OLLAMA_BASE_URL"], defaultModelKey: "OLLAMA_MODEL" },
    ];

  const llmRows: CheckRow[] = providerInfo.map(({ p, envVars, defaultModelKey }) => ({
    key: p,
    label: p.charAt(0).toUpperCase() + p.slice(1),
    description:
      p === "claude"
        ? "Anthropic Claude — best for structured output."
        : p === "gemini"
          ? "Google Gemini — large output window."
          : p === "openai"
            ? "OpenAI GPT-4o."
            : "Local Ollama — free, runs offline.",
    envVars,
    status: hasProvider(p) ? "ok" : "missing",
    detail: hasProvider(p) ? `model: ${String(env[defaultModelKey])}` : undefined,
  }));

  const perTask = [
    { task: "auto_score", envVar: "AUTO_SCORE_PROVIDER" },
    { task: "match", envVar: "MATCH_PROVIDER" },
    { task: "cv_rewrite", envVar: "CV_REWRITE_PROVIDER" },
    { task: "cover_letter", envVar: "COVER_LETTER_PROVIDER" },
    { task: "flashcards", envVar: "FLASHCARDS_PROVIDER" },
    { task: "gaps", envVar: "GAPS_PROVIDER" },
    { task: "linkedin_import", envVar: "LINKEDIN_IMPORT_PROVIDER" },
    { task: "linkedin_seo", envVar: "LINKEDIN_SEO_PROVIDER" },
    { task: "learn_resources", envVar: "LEARN_RESOURCES_PROVIDER" },
  ].map((t) => ({
    ...t,
    resolvedFromEnv: (env[t.envVar as keyof typeof env] as string) || null,
  }));

  const companyIntel: CheckRow[] = [
    row(
      "wikidata",
      "Wikidata (description / HQ / founded year)",
      "Free, no key. Resolves company name to a QID and pulls structured facts.",
      [],
      true,
    ),
    row(
      "clearbit-logo",
      "Clearbit Logo URL builder",
      "Free, no key. Derives a logo URL from the company website host.",
      [],
      true,
    ),
    row(
      "nominatim",
      "OpenStreetMap Nominatim geocoder",
      "Free, no key (1 req/sec). Geocodes user home address + company HQ for distance.",
      [],
      true,
    ),
    row(
      "glassdoor-apify",
      "Glassdoor via Apify",
      "Optional. Set APIFY_GLASSDOOR_ACTOR_ID to enable rating + review count + recommend % + top pro/con on enrich.",
      ["APIFY_API_TOKEN", "APIFY_GLASSDOOR_ACTOR_ID"],
      !!env.APIFY_API_TOKEN && !!env.APIFY_GLASSDOOR_ACTOR_ID,
      env.APIFY_GLASSDOOR_ACTOR_ID
        ? `actor: ${env.APIFY_GLASSDOOR_ACTOR_ID}`
        : "no actor id set",
    ),
  ];

  const portfolio: CheckRow[] = [
    row(
      "github-portfolio",
      "GitHub portfolio import",
      "Pulls public repos. Optional token raises rate limit 60/h → 5000/h.",
      ["GITHUB_TOKEN"],
      true,
      process.env.GITHUB_TOKEN ? "token set — 5000/h" : "no token — 60/h limit",
    ),
    row(
      "gitlab-portfolio",
      "GitLab portfolio import",
      "Pulls public projects from gitlab.com or a self-hosted instance.",
      ["GITLAB_TOKEN", "GITLAB_BASE_URL"],
      true,
      [
        process.env.GITLAB_BASE_URL ? `base: ${process.env.GITLAB_BASE_URL}` : "gitlab.com",
        process.env.GITLAB_TOKEN ? "token set" : "no token",
      ].join(" · "),
    ),
  ];

  const sources = await listSources();

  const profile = await getProfile();
  const activeCv = await getActiveCv();

  let searchProfileCount = 0;
  try {
    const sp = await listProfiles();
    searchProfileCount = sp.length;
  } catch {
    searchProfileCount = 0;
  }

  return {
    jobSources,
    llmProviders: {
      rows: llmRows,
      defaultProvider: env.DEFAULT_LLM_PROVIDER,
      perTask,
    },
    portfolio,
    companyIntel,
    scheduler: {
      enabled: bool(env.ENABLE_SCHEDULER),
      batchSize: env.SCHEDULER_BATCH_SIZE,
      sources: searchProfileCount,
    },
    budgets: {
      apifyMonthlyCapUsd: env.BUDGET_APIFY_USD_MONTHLY,
      apifyConfigured: !!env.APIFY_API_TOKEN,
    },
    profile: {
      fullName: profile?.fullName ?? null,
      email: profile?.email ?? null,
      location: profile?.location ?? null,
      hasLinkedinUrl: !!profile?.linkedinUrl,
      activeCvTitle: activeCv?.title ?? null,
    },
    uploadDir: env.UPLOAD_DIR,
    portfolioSourceCount: sources.length,
  };
}
