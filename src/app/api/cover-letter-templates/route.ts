import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/lib/api";
import { createTemplate, listTemplates } from "@/lib/repo/coverLetters";

export const runtime = "nodejs";

const postSchema = z.object({
  name: z.string().min(1).max(200),
  bodyMd: z.string().max(50000),
  isDefault: z.boolean().optional(),
});

export const GET = wrap(async () => {
  const templates = await listTemplates();
  return NextResponse.json(templates);
});

export const POST = wrap(async (req: Request) => {
  const body = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const created = await createTemplate(parsed.data);
  return NextResponse.json(created, { status: 201 });
});
