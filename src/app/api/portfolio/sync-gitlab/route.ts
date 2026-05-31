import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/lib/api";
import { fetchGitlabPortfolio } from "@/lib/portfolio/gitlab";
import { upsertGitlabItems } from "@/lib/repo/portfolio";

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z.object({
  username: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .regex(/^[a-zA-Z0-9._-]+$/, "Must be a valid GitLab username"),
  includeReadmes: z.boolean().optional().default(true),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
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
  const { username, includeReadmes, limit } = parsed.data;
  const items = await fetchGitlabPortfolio(username, { includeReadmes, limit });
  const { inserted, updated } = await upsertGitlabItems(username, items);
  return NextResponse.json({
    username,
    fetched: items.length,
    inserted,
    updated,
  });
});
