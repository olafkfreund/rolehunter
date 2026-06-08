import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/lib/api";
import { generateHooksForApplication } from "@/lib/repo/coverLetters";

export const runtime = "nodejs";
export const maxDuration = 120;

const providerEnum = z.enum(["claude", "gemini"]);

const postSchema = z.object({
  applicationId: z.number().int().positive(),
  provider: providerEnum,
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
  const { applicationId, provider } = parsed.data;
  const hooks = await generateHooksForApplication(applicationId, { provider });
  return NextResponse.json(hooks);
});
