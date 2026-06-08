import { NextResponse } from "next/server";
import { z } from "zod";
import { getProvider } from "@/lib/llm";
import type { CvJson, JobInput, Provider } from "@/lib/llm/types";
import { getActiveCv } from "@/lib/repo/cv";
import { getJob } from "@/lib/repo/jobs";
import { insertVariant, listVariantsForJob } from "@/lib/repo/variants";
import { extractTechTokens } from "@/lib/tech-tokens";

export const runtime = "nodejs";
export const maxDuration = 120;

const providerEnum = z.enum(["claude", "gemini"]);

const postSchema = z.object({
  jobId: z.number().int().positive(),
  provider: providerEnum,
  matchId: z.number().int().positive().optional(),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const jobIdRaw = url.searchParams.get("jobId");
  const jobId = jobIdRaw ? Number(jobIdRaw) : NaN;
  if (!Number.isFinite(jobId) || !Number.isInteger(jobId) || jobId <= 0) {
    return NextResponse.json({ error: "Invalid jobId" }, { status: 400 });
  }
  const variants = await listVariantsForJob(jobId);
  return NextResponse.json(variants[0] ?? null);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { jobId, provider, matchId } = parsed.data;

  const [job, cv] = await Promise.all([getJob(jobId), getActiveCv()]);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (!cv) {
    return NextResponse.json(
      { error: "No master CV uploaded yet" },
      { status: 409 },
    );
  }

  const jobInput: JobInput = {
    title: job.title,
    company: job.company,
    location: job.location || undefined,
    description: job.description,
  };

  const llm = getProvider(provider as Provider);
  const result = await llm.rewriteCv(cv.parsedJson as CvJson, jobInput);

  const keywords = Array.isArray(result.keywords)
    ? result.keywords.filter((k): k is string => typeof k === "string")
    : [];

  const masterTokens = extractTechTokens(cv.rawMarkdown);
  const tailoredTokens = extractTechTokens(result.markdown);
  const unverifiedSkills = tailoredTokens.filter(
    (t) => !masterTokens.some((mt) => mt.toLowerCase() === t.toLowerCase()),
  );

  const variant = await insertVariant({
    jobId,
    matchId: matchId ?? null,
    tailoredMarkdown: result.markdown,
    keywords,
    provider: llm.name,
    verificationReport: {
      unverifiedSkills,
    },
  });
  return NextResponse.json(variant);
}
