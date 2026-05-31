import { NextResponse } from "next/server";
import { wrap } from "@/lib/api";
import { triggerRunNow } from "@/lib/repo/searchProfiles";

export const runtime = "nodejs";

function parseId(s: string): number | null {
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export const POST = wrap(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id: idStr } = await ctx.params;
    const id = parseId(idStr);
    if (id === null) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const profile = await triggerRunNow(id);
    if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({
      queued: true,
      profile,
      note: "Scheduled to fire on the next 60s tick.",
    });
  },
);
