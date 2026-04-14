import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/lib/api";
import {
  generateForJob,
  listForJob,
} from "@/lib/repo/flashcards";

export const runtime = "nodejs";
export const maxDuration = 120;

const providerEnum = z.enum(["claude", "gemini"]);

const postSchema = z.object({
  jobId: z.number().int().positive(),
  provider: providerEnum,
});

export const GET = wrap(async (req: Request) => {
  const url = new URL(req.url);
  const jobIdRaw = url.searchParams.get("jobId");
  if (!jobIdRaw) {
    return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
  }
  const jobId = Number(jobIdRaw);
  if (!Number.isInteger(jobId) || jobId <= 0) {
    return NextResponse.json({ error: "Invalid jobId" }, { status: 400 });
  }
  const rows = await listForJob(jobId);
  return NextResponse.json(rows);
});

export const POST = wrap(async (req: Request) => {
  const body = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { jobId, provider } = parsed.data;
  const rows = await generateForJob(jobId, provider);
  return NextResponse.json(rows, { status: 201 });
});
