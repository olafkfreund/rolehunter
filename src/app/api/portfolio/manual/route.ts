import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/lib/api";
import { createManualItem } from "@/lib/repo/portfolio";

export const runtime = "nodejs";

const bodySchema = z.object({
  kind: z.enum(["manual_project", "manual_skill", "manual_role"]),
  title: z.string().trim().min(1).max(500),
  description: z.string().max(20_000).optional().default(""),
  url: z.string().url().optional().nullable(),
  tech: z.array(z.string().trim().min(1).max(100)).max(50).optional().default([]),
  highlights: z.array(z.string().trim().min(1).max(500)).max(20).optional().default([]),
  role: z.string().trim().max(200).optional().nullable(),
  startedAt: z.string().optional().nullable(),
  endedAt: z.string().optional().nullable(),
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
  const item = await createManualItem(parsed.data);
  return NextResponse.json({ item }, { status: 201 });
});
