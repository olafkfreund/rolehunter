import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createApplication,
  findApplicationByJobId,
  getApplicationByJobId,
  listApplicationsWithJob,
} from "@/lib/repo/applications";
import { wrap } from "@/lib/api";

export const runtime = "nodejs";

const stageSchema = z.enum([
  "saved",
  "applied",
  "phone",
  "onsite",
  "offer",
  "rejected",
]);

export const GET = wrap(async (req: Request) => {
  const url = new URL(req.url);
  const jobIdRaw = url.searchParams.get("jobId");
  if (jobIdRaw !== null) {
    const jobId = Number(jobIdRaw);
    if (!Number.isInteger(jobId) || jobId <= 0) {
      return NextResponse.json({ error: "Invalid jobId" }, { status: 400 });
    }
    const app = await getApplicationByJobId(jobId);
    return NextResponse.json(app ?? null);
  }
  const apps = await listApplicationsWithJob();
  return NextResponse.json(apps);
});

const postSchema = z.object({
  jobId: z.number().int().positive(),
  stage: stageSchema.optional(),
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { jobId, stage } = parsed.data;
  const existing = await findApplicationByJobId(jobId);
  if (existing) {
    return NextResponse.json(existing, { status: 200 });
  }

  const created = await createApplication({ jobId, stage });
  return NextResponse.json(created, { status: 201 });
}
