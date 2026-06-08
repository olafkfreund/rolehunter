import { NextResponse } from "next/server";
import { getProvider } from "@/lib/llm";
import type { CvJson, Provider } from "@/lib/llm/types";
import { getActiveCv } from "@/lib/repo/cv";
import { getVariant, updateVariant } from "@/lib/repo/variants";
import { wrap } from "@/lib/api";

export const runtime = "nodejs";
export const maxDuration = 120;

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && Number.isInteger(n) && n > 0 ? n : null;
}

export const POST = wrap(async (
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) => {
  const { id } = await ctx.params;
  const parsedId = parseId(id);
  if (parsedId === null) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const [variant, cv] = await Promise.all([getVariant(parsedId), getActiveCv()]);
  if (!variant) {
    return NextResponse.json({ error: "Variant not found" }, { status: 404 });
  }
  if (!cv) {
    return NextResponse.json({ error: "No active master CV" }, { status: 409 });
  }

  const llmProviderName = (variant.provider as Provider) || "claude";
  const llm = getProvider(llmProviderName);

  const result = await llm.verifyCv(cv.parsedJson as CvJson, variant.tailoredMarkdown);

  const updatedReport = {
    unverifiedSkills: variant.verificationReport?.unverifiedSkills ?? [],
    llmCheck: {
      passed: result.passed,
      discrepancies: result.discrepancies,
      checkedAt: new Date().toISOString(),
    },
  };

  const updated = await updateVariant(parsedId, {
    verificationReport: updatedReport,
  });

  return NextResponse.json(updated);
});
