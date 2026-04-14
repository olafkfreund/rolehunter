import { NextResponse } from "next/server";
import { z } from "zod";
import { insertPasted, listJobs } from "@/lib/repo/jobs";

export const runtime = "nodejs";

export async function GET() {
  const jobs = await listJobs();
  return NextResponse.json(jobs);
}

const postSchema = z.object({
  title: z.string().min(1).max(300),
  company: z.string().max(200).optional(),
  location: z.string().max(200).optional(),
  description: z.string().min(1).max(50000),
  url: z.string().url().or(z.literal("")).optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { url, ...rest } = parsed.data;
  const job = await insertPasted({
    ...rest,
    url: url && url.length > 0 ? url : undefined,
  });
  return NextResponse.json(job, { status: 201 });
}
