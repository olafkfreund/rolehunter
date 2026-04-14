import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/lib/api";
import { listCanonicalGaps } from "@/lib/repo/gaps";

export const runtime = "nodejs";

const statusSchema = z.enum(["to_learn", "learning", "done", "dismissed"]);

export const GET = wrap(async (req: Request) => {
  const url = new URL(req.url);
  const statusRaw = url.searchParams.get("status");
  if (statusRaw !== null) {
    const parsed = statusSchema.safeParse(statusRaw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    const rows = await listCanonicalGaps({ status: parsed.data });
    return NextResponse.json(rows);
  }
  const rows = await listCanonicalGaps();
  return NextResponse.json(rows);
});
