// OpenAI provider — mirrors the Claude/Gemini provider shape so the rest of the
// app stays provider-agnostic. Uses OpenAI v4 SDK (chat.completions.create).
// v5/v6 changed the client surface (responses API); we pin to v4 per spec §10.7.
//
// See doc/plans/2026-05-31-rolehunter-v3-design.md §12.

import OpenAI from "openai";
import { getEnv } from "../env";
import {
  SYSTEM_ANALYZE_FEEDBACK,
  SYSTEM_CANONICALIZE_GAPS,
  SYSTEM_COVER_LETTER,
  SYSTEM_EXTRACT_CV,
  SYSTEM_FLASHCARDS,
  SYSTEM_LEARN_RESOURCES,
  SYSTEM_LINKEDIN_IMPORT,
  SYSTEM_LINKEDIN_SEO,
  SYSTEM_MATCH,
  SYSTEM_REWRITE_CV,
  SYSTEM_REWRITE_SECTION,
  SYSTEM_VERIFY_CV,
  SYSTEM_COVER_LETTER_HOOKS,
  SYSTEM_SUGGEST_ROLES,
} from "./prompts";
import type {
  CoverLetterInput,
  CoverLetterResult,
  CvJson,
  FeedbackAnalysis,
  FeedbackEntry,
  FlashcardOut,
  GapCanonicalizeResult,
  GapClusterMember,
  JobInput,
  LearningResourcesResult,
  LinkedInImportResult,
  LinkedInInput,
  LinkedInResult,
  LlmProvider,
  MatchResult,
  RewriteResult,
  RewriteSectionInput,
  RewriteSectionResult,
  VerifyCvResult,
  GenerateHooksInput,
  GenerateHooksResult,
  SuggestedRole,
} from "./types";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (client) return client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");
  client = new OpenAI({ apiKey });
  return client;
}

async function call(system: string, user: string, maxTokens = 4096): Promise<string> {
  const env = getEnv();
  const res = await getClient().chat.completions.create({
    model: env.OPENAI_MODEL,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  const content = res.choices[0]?.message?.content;
  if (!content) throw new Error("No content in OpenAI response");
  return content;
}

function parseJson<T>(text: string): T {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : trimmed;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  const body = start >= 0 && end >= 0 ? raw.slice(start, end + 1) : raw;
  return JSON.parse(body) as T;
}

function parseJsonArray<T>(text: string): T[] {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : trimmed;
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  const body = start >= 0 && end >= 0 ? raw.slice(start, end + 1) : raw;
  return JSON.parse(body) as T[];
}

export const openaiProvider: LlmProvider = {
  name: "openai",

  async extractCv(rawText: string): Promise<CvJson> {
    const text = await call(SYSTEM_EXTRACT_CV, rawText.slice(0, 40_000), 4096);
    return parseJson<CvJson>(text);
  },

  async match(
    cv: CvJson,
    job: JobInput,
    portfolioItems?: Array<{
      title: string;
      kind: string;
      description: string;
      tech: string[];
      role?: string | null;
      url?: string | null;
    }> | null,
  ): Promise<MatchResult> {
    const user = [
      `## CV\n\n${JSON.stringify(cv, null, 2)}`,
      `## Job\n\nTitle: ${job.title}\nCompany: ${job.company}\nLocation: ${job.location ?? ""}\n\n${job.description}`,
      portfolioItems && portfolioItems.length > 0
        ? `## Candidate Portfolio Sources & Projects\nUse these real projects, repositories, and technical skills as additional context and evidence of candidate skills/experience to enrich the evaluation (consider them when assigning the score and listing strengths/gaps):\n${JSON.stringify(portfolioItems, null, 2)}`
        : "",
    ].filter(Boolean).join("\n\n");
    const text = await call(SYSTEM_MATCH, user, 2048);
    return parseJson<MatchResult>(text);
  },

  async rewriteCv(
    cv: CvJson,
    job: JobInput,
    portfolioItems?: Array<{
      title: string;
      kind: string;
      description: string;
      tech: string[];
      role?: string | null;
      url?: string | null;
    }> | null,
  ): Promise<RewriteResult> {
    const user = [
      `## CV\n\n${JSON.stringify(cv, null, 2)}`,
      `## Job\n\nTitle: ${job.title}\nCompany: ${job.company}\n\n${job.description}`,
      portfolioItems && portfolioItems.length > 0
        ? `## Candidate Portfolio Sources & Projects\nUse these real projects, repositories, and technical skills as additional context and evidence of candidate skills/experience to enrich the tailored CV sections (Summary, Skills, Projects, Work Experience) as appropriate. Never invent employers or dates:\n${JSON.stringify(portfolioItems, null, 2)}`
        : "",
    ].filter(Boolean).join("\n\n");
    const text = await call(SYSTEM_REWRITE_CV, user, 6000);
    return parseJson<RewriteResult>(text);
  },

  async linkedinSeo(input: LinkedInInput): Promise<LinkedInResult> {
    const user = `Target role: ${input.targetRole}\n\nCurrent headline:\n${input.headline}\n\nCurrent About:\n${input.about}`;
    const text = await call(SYSTEM_LINKEDIN_SEO, user, 3000);
    return parseJson<LinkedInResult>(text);
  },

  async generateCoverLetter(input: CoverLetterInput): Promise<CoverLetterResult> {
    const user = [
      `## CV\n\n${JSON.stringify(input.cv, null, 2)}`,
      `## Job\n\nTitle: ${input.job.title}\nCompany: ${input.job.company}\nLocation: ${input.job.location ?? ""}\n\n${input.job.description}`,
      `## Profile\n\n${JSON.stringify(input.profile, null, 2)}`,
      input.portfolioItems && input.portfolioItems.length > 0
        ? `## Candidate Portfolio Sources & Projects\nUse these real projects, repositories, and technical skills as additional context and evidence of candidate skills/experience to enrich the cover letter. Do not invent details:\n${JSON.stringify(input.portfolioItems, null, 2)}`
        : "",
      input.templateBodyMd ? `## Template\n\n${input.templateBodyMd}` : "",
      input.selectedHook ? `## Selected Hook\nUse this EXACT text as the opening hook paragraph:\n${input.selectedHook}` : "",
      input.selectedEvidence && input.selectedEvidence.length > 0
        ? `## Selected Evidence\nFocus your evidence paragraph(s) ONLY on these specific points:\n${input.selectedEvidence.map((b) => `- ${b}`).join("\n")}`
        : "",
      input.ctaTone ? `## Selected CTA Tone\nAdjust the closing paragraph to match this tone: ${input.ctaTone}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    const text = await call(SYSTEM_COVER_LETTER, user, 3000);
    return parseJson<CoverLetterResult>(text);
  },

  async generateFlashcards(cv: CvJson, job: JobInput): Promise<FlashcardOut[]> {
    const user = `## CV\n\n${JSON.stringify(cv, null, 2)}\n\n## Job\n\nTitle: ${job.title}\nCompany: ${job.company}\n\n${job.description}`;
    const text = await call(SYSTEM_FLASHCARDS, user, 6000);
    return parseJsonArray<FlashcardOut>(text);
  },

  async analyzeFeedback(entries: FeedbackEntry[]): Promise<FeedbackAnalysis> {
    const user = JSON.stringify(entries, null, 2);
    const text = await call(SYSTEM_ANALYZE_FEEDBACK, user, 2500);
    return parseJson<FeedbackAnalysis>(text);
  },

  async canonicalizeGaps(input: GapClusterMember[]): Promise<GapCanonicalizeResult> {
    const user = JSON.stringify(input);
    const text = await call(SYSTEM_CANONICALIZE_GAPS, user, 8000);
    return parseJson<GapCanonicalizeResult>(text);
  },

  async generateLearningResources(skill: string): Promise<LearningResourcesResult> {
    const text = await call(SYSTEM_LEARN_RESOURCES, `Skill: ${skill}`, 2500);
    return parseJson<LearningResourcesResult>(text);
  },

  async importLinkedInPdf(rawText: string): Promise<LinkedInImportResult> {
    const text = await call(SYSTEM_LINKEDIN_IMPORT, rawText.slice(0, 60_000), 16000);
    try {
      return parseJson<LinkedInImportResult>(text);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(
        `LinkedIn JSON truncated or malformed via OpenAI (${msg}). Try Claude or Gemini if the issue persists.`,
      );
    }
  },

  async rewriteSection(input: RewriteSectionInput): Promise<RewriteSectionResult> {
    const user = [
      `# Current CV (markdown):\n${input.cvMarkdown.slice(0, 12_000)}`,
      `# Section to rewrite: ${input.section}`,
      `# Guidance: ${input.guidance}`,
      input.targetRole ? `# Target role: ${input.targetRole}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    const text = await call(SYSTEM_REWRITE_SECTION, user, 3000);
    return { markdown: stripRewriteFences(text) };
  },

  async verifyCv(cv: CvJson, tailoredMarkdown: string): Promise<VerifyCvResult> {
    const user = `## Master CV (JSON)\n\n${JSON.stringify(cv, null, 2)}\n\n## Tailored CV (Markdown)\n\n${tailoredMarkdown}`;
    const text = await call(SYSTEM_VERIFY_CV, user, 4096);
    return parseJson<VerifyCvResult>(text);
  },

  async generateCoverLetterHooks(input: GenerateHooksInput): Promise<GenerateHooksResult> {
    const user = [
      `## CV\n\n${JSON.stringify(input.cv, null, 2)}`,
      `## Job\n\nTitle: ${input.job.title}\nCompany: ${input.job.company}\n\n${input.job.description}`,
    ].join("\n\n");
    const text = await call(SYSTEM_COVER_LETTER_HOOKS, user, 2048);
    return parseJson<GenerateHooksResult>(text);
  },
  
  async suggestRoles(cv: CvJson): Promise<SuggestedRole[]> {
    const user = `## CV\n\n${JSON.stringify(cv, null, 2)}`;
    const text = await call(SYSTEM_SUGGEST_ROLES, user, 2048);
    return parseJson<SuggestedRole[]>(text);
  },
};

function stripRewriteFences(text: string): string {
  let t = text.trim();
  const fenced = t.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/);
  if (fenced) t = fenced[1].trim();
  return t;
}
