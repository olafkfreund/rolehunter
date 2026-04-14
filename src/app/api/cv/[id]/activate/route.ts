import { NextResponse } from "next/server";
import { wrap } from "@/lib/api";
import { setActiveCv } from "@/lib/repo/cv";

export const runtime = "nodejs";

function parseId(idStr: string): number | null {
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

export const POST = wrap(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id: idStr } = await ctx.params;
    const id = parseId(idStr);
    if (id === null) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const cv = await setActiveCv(id);
    return NextResponse.json(cv);
  },
);
