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

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const parsedId = parseId(id);
  if (parsedId === null) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const body = (await req.json().catch(() => ({}))) as { hidden?: unknown };
  if (typeof body.hidden !== "boolean") {
    return NextResponse.json(
      { error: "Body must include { hidden: boolean }" },
      { status: 400 },
    );
  }
  const { setJobHidden } = await import("@/lib/repo/jobs");
  const ok = await setJobHidden(parsedId, body.hidden);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, hidden: body.hidden });
}
