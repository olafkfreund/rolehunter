import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/lib/api";
import { ensureCompanyForJob } from "@/lib/repo/companies";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  jobId: z.coerce.number().int().positive(),
});

export const POST = wrap(async (req: Request) => {
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") },
      { status: 400 },
    );
  }
  const company = await ensureCompanyForJob(parsed.data.jobId);
  if (!company) {
    return NextResponse.json(
      { error: "Job has no company name to enrich" },
      { status: 412 },
    );
  }
  return NextResponse.json({ company });
});
