import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/lib/api";
import { deletePortfolioItem, toggleHidden } from "@/lib/repo/portfolio";

export const runtime = "nodejs";

const patchSchema = z.object({
  hidden: z.boolean(),
});

function parseId(s: string): number | null {
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export const PATCH = wrap(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id: idStr } = await ctx.params;
    const id = parseId(idStr);
    if (id === null) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const body = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => i.message).join("; ") },
        { status: 400 },
      );
    }
    const row = await toggleHidden(id, parsed.data.hidden);
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(row);
  },
);

export const DELETE = wrap(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id: idStr } = await ctx.params;
    const id = parseId(idStr);
    if (id === null) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const ok = await deletePortfolioItem(id);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ deleted: true });
  },
);
