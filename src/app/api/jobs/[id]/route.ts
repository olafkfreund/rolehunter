import { NextResponse } from "next/server";
import { deleteJob, getJob } from "@/lib/repo/jobs";

export const runtime = "nodejs";

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const parsedId = parseId(id);
  if (parsedId === null) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const job = await getJob(parsedId);
  if (!job) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(job);
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const parsedId = parseId(id);
  if (parsedId === null) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  await deleteJob(parsedId);
  return NextResponse.json({ ok: true });
}
