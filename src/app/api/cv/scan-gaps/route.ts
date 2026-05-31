// POST /api/cv/scan-gaps — scan the active CV against a target role description
// and surface skill gaps. Reuses existing match() against a synthetic JobInput.

import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/lib/api";
import { getProvider } from "@/lib/llm";
import type { CvJson, JobInput } from "@/lib/llm/types";
import { getActiveCv } from "@/lib/repo/cv";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  targetRole: z.string().trim().min(3).max(200),
  jobDescription: z.string().trim().max(20_000).optional(),
});

export const POST = wrap(async (req: Request) => {
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { targetRole, jobDescription } = parsed.data;

  const cv = await getActiveCv();
  if (!cv) {
    return NextResponse.json({ error: "No active CV. Upload one in /profile first." }, { status: 412 });
  }

  const jobInput: JobInput = {
    title: targetRole,
    company: "Generic",
    description: jobDescription || `A standard role for ${targetRole}. Looking for typical skills, experience, and qualifications expected at this level.`,
  };

  const provider = getProvider("gaps");
  const result = await provider.match(cv.parsedJson as CvJson, jobInput);

  return NextResponse.json({
    targetRole,
    score: result.score,
    strengths: result.strengths,
    gaps: result.gaps,
    reasoning: result.reasoning,
  });
});
