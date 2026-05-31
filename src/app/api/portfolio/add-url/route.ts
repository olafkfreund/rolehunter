import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/lib/api";
import { fetchWebPortfolio } from "@/lib/portfolio/web";
import { upsertWebItem } from "@/lib/repo/portfolio";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  url: z.string().url(),
  kind: z.enum(["blog_post", "website"]).optional().default("blog_post"),
});

export const POST = wrap(async (req: Request) => {
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") },
      { status: 400 },
    );
  }
  const { url, kind } = parsed.data;
  const item = await fetchWebPortfolio(url, kind);
  const { inserted, updated } = await upsertWebItem(kind, item);
  return NextResponse.json({
    url: item.url,
    kind,
    title: item.title,
    tech: item.tech,
    inserted,
    updated,
  });
});
