// POST /api/cv/rewrite-section — rewrite a specific section of the CV with a
// guided LLM call. Returns the rewritten markdown without persisting; the user
// applies the diff in the UI.

import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/lib/api";
import { getProvider } from "@/lib/llm";
import { getActiveCv } from "@/lib/repo/cv";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  section: z.enum(["summary", "skills", "experience", "education", "all"]),
  guidance: z.string().trim().min(3).max(500),
  targetRole: z.string().trim().max(200).optional(),
});

const SYSTEM = `You are a senior technical recruiter helping a candidate sharpen their CV.

Rewrite the requested section to:
- Quantify outcomes with numbers, percentages, dollar/€/£ amounts wherever possible
- Use STAR (Situation-Task-Action-Result) where appropriate
- Match the spelling of skills and technologies to industry-standard tokens
- Avoid LLM-tell phrases: "thrilled", "passionate", "in today's fast-paced", "leveraged", "robust", "delve into", "tapestry of"
- Keep sentences varied in length — mix punchy short ones with denser detailed ones
- Active voice; verb-first bullets where the section uses bullets
- Match the tone of an editorial-quality professional CV

Return ONLY the rewritten markdown for that section. No preamble, no commentary, no fences.`;

export const POST = wrap(async (req: Request) => {
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { section, guidance, targetRole } = parsed.data;

  const cv = await getActiveCv();
  if (!cv) {
    return NextResponse.json({ error: "No active CV." }, { status: 412 });
  }

  const provider = getProvider("cv_rewrite");

  const user = [
    `# Current CV (markdown):\n${cv.rawMarkdown.slice(0, 12_000)}`,
    `# Section to rewrite: ${section}`,
    `# Guidance: ${guidance}`,
    targetRole ? `# Target role: ${targetRole}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  // Use linkedinSeo as a low-friction provider call that returns markdown suggestions.
  // (A future iteration adds a dedicated rewriteSection method to LlmProvider.)
  const result = await provider.linkedinSeo({
    targetRole: targetRole ?? "general technical role",
    headline: section,
    about: user + "\n\n" + SYSTEM,
  });

  return NextResponse.json({
    section,
    guidance,
    rewritten: result.suggestions,
  });
});
