// POST /api/cv/ats-check — heuristic + LLM-blended ATS scorer for the active CV.
//
// Heuristic checks run locally (instant, free). LLM call runs only on request.
// Returns a structured report with concrete issues + suggested fixes.

import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/lib/api";
import { getProvider } from "@/lib/llm";
import type { CvJson } from "@/lib/llm/types";
import { getActiveCv } from "@/lib/repo/cv";

export const runtime = "nodejs";
export const maxDuration = 120;

interface AtsCheck {
  id: string;
  label: string;
  severity: "ok" | "warn" | "err";
  detail: string;
}

interface AtsReport {
  score: number; // 0-100
  checks: AtsCheck[];
  llmSummary?: string;
}

const bodySchema = z.object({
  includeLlm: z.boolean().optional().default(true),
  targetRole: z.string().trim().max(200).optional(),
});

function runHeuristics(cv: CvJson, rawMd: string): AtsCheck[] {
  const checks: AtsCheck[] = [];

  // 1. Contact info present
  const hasEmail = !!cv.email || /[\w.-]+@[\w.-]+\.\w+/.test(rawMd);
  const hasPhone = !!cv.phone || /\+?\d[\d\s().-]{8,}/.test(rawMd);
  checks.push({
    id: "contact-email",
    label: "Email present",
    severity: hasEmail ? "ok" : "err",
    detail: hasEmail ? "Email parsed correctly" : "ATS parsers expect email in header — add yours",
  });
  checks.push({
    id: "contact-phone",
    label: "Phone present",
    severity: hasPhone ? "ok" : "warn",
    detail: hasPhone ? "Phone number found" : "Optional but many ATS look for phone format",
  });

  // 2. Skills section
  const hasSkillsHeader = /^#{1,3}\s*(skills|technical skills|technologies)/im.test(rawMd);
  const hasSkillsList = !!(cv.skills && cv.skills.length >= 5);
  checks.push({
    id: "skills-section",
    label: "Skills section",
    severity: hasSkillsHeader && hasSkillsList ? "ok" : hasSkillsList ? "warn" : "err",
    detail:
      hasSkillsHeader && hasSkillsList
        ? `${cv.skills?.length ?? 0} skills listed under a parseable header`
        : hasSkillsList
        ? `Skills found but no standard 'Skills' header — Greenhouse/Workday parsers want this`
        : "Add an explicit 'Skills:' section with 8-15 entries to pass keyword parsers",
  });

  // 3. Experience
  const expCount = cv.experience?.length ?? 0;
  checks.push({
    id: "experience-count",
    label: "Experience entries",
    severity: expCount >= 2 ? "ok" : expCount >= 1 ? "warn" : "err",
    detail: `${expCount} role${expCount === 1 ? "" : "s"} listed`,
  });

  // 4. Quantified bullets (look for numbers/percents in experience bullets)
  const allBullets = (cv.experience ?? []).flatMap((e) => e.bullets ?? []);
  const quantified = allBullets.filter((b) => /\d+%|\$\d|\b\d{2,}\b/.test(b)).length;
  const quantRatio = allBullets.length > 0 ? quantified / allBullets.length : 0;
  checks.push({
    id: "quantified",
    label: "Quantified achievements",
    severity: quantRatio >= 0.5 ? "ok" : quantRatio >= 0.25 ? "warn" : "err",
    detail: `${quantified} of ${allBullets.length} bullets have numeric outcomes (${Math.round(quantRatio * 100)}%) — target 50%+`,
  });

  // 5. Date parseability — most ATS need "MMM YYYY" or "YYYY-MM" formats
  const dateExamples = (cv.experience ?? []).flatMap((e) => [e.start, e.end].filter(Boolean) as string[]);
  const parseable = dateExamples.filter((d) =>
    /^(\d{4}|\w{3,}\.?\s+\d{4}|\d{1,2}\/\d{4}|\d{4}-\d{2}|present|current)$/i.test(d.trim()),
  ).length;
  const dateRatio = dateExamples.length > 0 ? parseable / dateExamples.length : 1;
  checks.push({
    id: "dates-parseable",
    label: "Dates parseable",
    severity: dateRatio >= 0.9 ? "ok" : dateRatio >= 0.7 ? "warn" : "err",
    detail: `${parseable}/${dateExamples.length} dates match standard formats. Workday's parser is strict — prefer "Jan 2024 – Present" or "2024-01".`,
  });

  // 6. Length / token budget — ATS truncate beyond ~2 pages
  const wordCount = rawMd.split(/\s+/).filter(Boolean).length;
  checks.push({
    id: "length",
    label: "Length (word count)",
    severity: wordCount >= 300 && wordCount <= 900 ? "ok" : wordCount > 900 ? "warn" : "err",
    detail: `${wordCount} words. Target 300–900 (1–2 pages); Workday truncates >1200.`,
  });

  // 7. No tables or columns — markdown tables aren't a CV-format problem but check anyway
  const tableLines = (rawMd.match(/^\|.*\|$/gm) ?? []).length;
  checks.push({
    id: "no-tables",
    label: "No multi-column layout",
    severity: tableLines === 0 ? "ok" : "warn",
    detail:
      tableLines === 0
        ? "Single-column structure — ATS-safe"
        : `Found ${tableLines} table rows — most ATS parsers flatten tables incorrectly; consider replacing with bullets`,
  });

  // 8. Education
  checks.push({
    id: "education",
    label: "Education listed",
    severity: cv.education && cv.education.length > 0 ? "ok" : "warn",
    detail: cv.education?.length ? `${cv.education.length} entr${cv.education.length === 1 ? "y" : "ies"}` : "Some ATS filter on education — add at least one entry",
  });

  return checks;
}

function calculateScore(checks: AtsCheck[]): number {
  const weights = { ok: 1, warn: 0.5, err: 0 };
  const total = checks.length;
  if (total === 0) return 0;
  const sum = checks.reduce((acc, c) => acc + weights[c.severity], 0);
  return Math.round((sum / total) * 100);
}

export const POST = wrap(async (req: Request) => {
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { includeLlm, targetRole } = parsed.data;

  const cv = await getActiveCv();
  if (!cv) {
    return NextResponse.json({ error: "No active CV. Upload one in /profile first." }, { status: 412 });
  }

  const cvJson = cv.parsedJson as CvJson;
  const checks = runHeuristics(cvJson, cv.rawMarkdown);
  const score = calculateScore(checks);

  let llmSummary: string | undefined;
  if (includeLlm) {
    try {
      const provider = getProvider("cv_rewrite");
      // Reuse linkedinSeo prompt shape — closest match to "score this for keyword/structure"
      const result = await provider.linkedinSeo({
        targetRole: targetRole ?? "general technical role",
        headline: cvJson.summary ?? "",
        about: cv.rawMarkdown.slice(0, 6000),
      });
      llmSummary = result.suggestions;
    } catch (err) {
      console.warn("[ats-check] LLM step failed", err);
    }
  }

  const report: AtsReport = { score, checks, llmSummary };
  return NextResponse.json(report);
});
