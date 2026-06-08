import { NextResponse } from "next/server";
import { wrap } from "@/lib/api";
import { getActiveCv } from "@/lib/repo/cv";
import { getProvider } from "@/lib/llm";
import type { Provider } from "@/lib/llm/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export const GET = wrap(async (req: Request) => {
  const url = new URL(req.url);
  const providerRaw = url.searchParams.get("provider") || undefined;
  
  const cv = await getActiveCv();
  if (!cv) {
    return NextResponse.json({ error: "No active CV. Upload one first." }, { status: 400 });
  }

  const llm = getProvider(providerRaw as Provider);
  const suggestions = await llm.suggestRoles(cv.parsedJson as any);
  
  return NextResponse.json({ suggestions });
});
