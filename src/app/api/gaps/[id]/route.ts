import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/lib/api";
import { getCanonicalGap, setLearningStatus } from "@/lib/repo/gaps";

export const runtime = "nodejs";

const statusSchema = z.enum(["to_learn", "learning", "done", "dismissed"]);

const patchSchema = z.object({
  learningStatus: statusSchema,
});

function parseId(raw: string): number | null {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

export const GET = wrap(async (
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) => {
  const { id: idStr } = await ctx.params;
  const id = parseId(idStr);
  if (id === null) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const detail = await getCanonicalGap(id);
  if (!detail) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(detail);
});

export const PATCH = wrap(async (
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) => {
  const { id: idStr } = await ctx.params;
  const id = parseId(idStr);
  if (id === null) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const result = await setLearningStatus(id, parsed.data.learningStatus);
  return NextResponse.json(result);
});
