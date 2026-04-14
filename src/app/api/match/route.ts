import { NextResponse } from "next/server";
import { z } from "zod";
import { getProvider } from "@/lib/llm";
import type { CvJson, JobInput, Provider } from "@/lib/llm/types";
import { getActiveCv } from "@/lib/repo/cv";
import { getJob } from "@/lib/repo/jobs";
import { getLatestMatch, insertMatch } from "@/lib/repo/matches";

export const runtime = "nodejs";
export const maxDuration = 120;

const providerEnum = z.enum(["claude", "gemini"]);

const postSchema = z.object({
  jobId: z.number().int().positive(),
  provider: providerEnum,
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const jobIdRaw = url.searchParams.get("jobId");
  const jobId = jobIdRaw ? Number(jobIdRaw) : NaN;
  if (!Number.isFinite(jobId) || !Number.isInteger(jobId) || jobId <= 0) {
    return NextResponse.json({ error: "Invalid jobId" }, { status: 400 });
  }
  const match = await getLatestMatch(jobId);
  return NextResponse.json(match);
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
  const { jobId, provider } = parsed.data;

  const job = await getJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const cv = await getActiveCv();
  if (!cv) {
    return NextResponse.json({ error: "No CV uploaded" }, { status: 412 });
  }

  const jobInput: JobInput = {
    title: job.title,
    company: job.company,
    location: job.location || undefined,
    description: job.description,
  };

  const llm = getProvider(provider as Provider);
  const result = await llm.match(cv.parsedJson as CvJson, jobInput);

  const strengths = Array.isArray(result.strengths)
    ? result.strengths.filter((s): s is string => typeof s === "string")
    : [];
  const gaps = Array.isArray(result.gaps)
    ? result.gaps.filter((g): g is string => typeof g === "string")
    : [];

  const match = await insertMatch({
    jobId,
    cvMasterId: cv.id,
    provider: llm.name,
    score: Math.max(0, Math.min(100, Math.round(result.score))),
    strengths,
    gaps,
    reasoningMd: result.reasoning,
  });
  return NextResponse.json(match);
}
