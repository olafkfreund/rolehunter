import { NextResponse } from "next/server";
import { wrap } from "@/lib/api";
import { listProfileRuns } from "@/lib/repo/searchProfiles";

export const runtime = "nodejs";

function parseId(s: string): number | null {
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export const GET = wrap(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id: idStr } = await ctx.params;
    const id = parseId(idStr);
    if (id === null) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const url = new URL(req.url);
    const limitRaw = url.searchParams.get("limit");
    const limit = limitRaw ? Math.max(1, Math.min(100, Number(limitRaw))) : 20;
    const runs = await listProfileRuns(id, limit);
    return NextResponse.json({ count: runs.length, runs });
  },
);
