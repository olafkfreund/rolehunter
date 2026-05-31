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
  const result = await provider.rewriteSection({
    cvMarkdown: cv.rawMarkdown,
    section,
    guidance,
    targetRole,
  });

  return NextResponse.json({
    section,
    guidance,
    rewritten: result.markdown,
  });
});
