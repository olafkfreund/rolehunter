import { NextResponse } from "next/server";
import { wrap } from "@/lib/api";
import { deleteSource, listSources } from "@/lib/repo/portfolio";

export const runtime = "nodejs";

export const GET = wrap(async () => {
  const sources = await listSources();
  return NextResponse.json({ sources });
});

export const DELETE = wrap(async (req: Request) => {
  const url = new URL(req.url);
  const sourceKey = url.searchParams.get("sourceKey");
  if (!sourceKey || sourceKey.length > 200) {
    return NextResponse.json({ error: "sourceKey query param required" }, { status: 400 });
  }
  const removed = await deleteSource(sourceKey);
  return NextResponse.json({ sourceKey, removed });
});
