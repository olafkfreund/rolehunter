import { NextResponse } from "next/server";
import { wrap } from "@/lib/api";
import { listPortfolioItems } from "@/lib/repo/portfolio";

export const runtime = "nodejs";

export const GET = wrap(async (req: Request) => {
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") ?? undefined;
  const items = await listPortfolioItems(kind ? { kind } : {});
  return NextResponse.json({ count: items.length, items });
});
