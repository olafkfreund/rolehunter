import { NextResponse } from "next/server";
import { z } from "zod";
import { getProfile } from "@/lib/repo/profile";
import { insertScan, listRecentScans } from "@/lib/repo/linkedin";
import { getProvider } from "@/lib/llm";

export const runtime = "nodejs";
export const maxDuration = 120;

const postSchema = z.object({
  targetRole: z.string().min(2).max(200),
  provider: z.enum(["claude", "gemini"]),
  headline: z.string().max(500).optional(),
  about: z.string().max(8000).optional(),
});

export async function GET() {
  const scans = await listRecentScans(10);
  return NextResponse.json(scans);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { targetRole, provider: providerName } = parsed.data;

  const profile = await getProfile();
  const headline = (parsed.data.headline ?? profile.linkedinHeadline ?? "").trim();
  const about = (parsed.data.about ?? profile.linkedinAbout ?? "").trim();

  if (!headline && !about) {
    return NextResponse.json(
      {
        error:
          "No LinkedIn headline or about text available. Fill them in your profile or include them in the request.",
      },
      { status: 412 },
    );
  }

  const provider = getProvider(providerName);
  const result = await provider.linkedinSeo({ headline, about, targetRole });

  const row = await insertScan({
    targetRole,
    provider: provider.name,
    score: Math.max(0, Math.min(100, Math.round(result.score))),
    keywordCoverage: result.coverage ?? {},
    suggestionsMd: result.suggestions ?? "",
    rewrittenHeadline: result.rewrittenHeadline,
    rewrittenAbout: result.rewrittenAbout,
  });

  return NextResponse.json(row);
}
