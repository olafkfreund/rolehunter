import { NextResponse } from "next/server";
import { wrap } from "@/lib/api";
import { getJob, updateJobDescription } from "@/lib/repo/jobs";
import { getJobDetail } from "@/lib/linkedin/client";

export const runtime = "nodejs";
export const maxDuration = 45;

function parseId(idStr: string): number | null {
  const id = Number(idStr);
  if (!Number.isFinite(id) || !Number.isInteger(id) || id <= 0) return null;
  return id;
}

export const POST = wrap(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id: idStr } = await ctx.params;
    const id = parseId(idStr);
    if (id === null) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const job = await getJob(id);
    if (!job) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (job.source !== "linkedin") {
      return NextResponse.json(
        { error: "Detail refresh only supported for linkedin jobs" },
        { status: 501 },
      );
    }

    if (!job.externalId) {
      return NextResponse.json(
        { error: "Job has no externalId; cannot refresh details" },
        { status: 400 },
      );
    }

    const detail = await getJobDetail(job.externalId);
    if (detail.description && detail.description.trim() !== "") {
      await updateJobDescription(job.id, detail.description);
    }

    const updated = await getJob(id);
    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  },
);
