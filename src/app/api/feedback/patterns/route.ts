import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/lib/api";
import { getProvider } from "@/lib/llm";
import type { FeedbackAnalysis, Provider } from "@/lib/llm/types";
import {
  recentForAnalysis,
  rejectionPatterns,
} from "@/lib/repo/feedback";

export const runtime = "nodejs";
export const maxDuration = 120;

const providerEnum = z.enum(["claude", "gemini"]);

export const GET = wrap(async (req: Request) => {
  const url = new URL(req.url);
  const analyseFlag = url.searchParams.get("analyse");
  const providerRaw = url.searchParams.get("provider");

  const counts = await rejectionPatterns();

  let analysis: FeedbackAnalysis | null = null;

  if (analyseFlag === "1" || analyseFlag === "true") {
    const entries = await recentForAnalysis(20);
    if (entries.length < 2) {
      analysis = null;
    } else {
      const parsedProvider = providerRaw
        ? providerEnum.safeParse(providerRaw)
        : null;
      const provider: Provider | undefined =
        parsedProvider && parsedProvider.success ? parsedProvider.data : undefined;
      const llm = getProvider(provider);
      analysis = await llm.analyzeFeedback(entries);
    }
  }

  return NextResponse.json({ counts, analysis });
});
