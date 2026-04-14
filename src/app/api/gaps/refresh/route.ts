import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/lib/api";
import { refreshCanonicalGaps } from "@/lib/repo/gaps";

export const runtime = "nodejs";
export const maxDuration = 180;

const bodySchema = z.object({
  provider: z.enum(["claude", "gemini"]).optional(),
});

export const POST = wrap(async (req: Request) => {
  const raw = await req.text();
  let parsed: z.infer<typeof bodySchema> = {};
  if (raw) {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const result = bodySchema.safeParse(json);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error.flatten() },
        { status: 400 },
      );
    }
    parsed = result.data;
  }
  const provider = parsed.provider ?? "claude";
  const summary = await refreshCanonicalGaps(provider);
  return NextResponse.json(summary);
});
