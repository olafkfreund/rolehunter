import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/lib/api";
import { reparseCv } from "@/lib/repo/cv";

export const runtime = "nodejs";
export const maxDuration = 120;

function parseId(idStr: string): number | null {
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

const bodySchema = z.object({
  provider: z.enum(["claude", "gemini"]).optional(),
});

export const POST = wrap(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id: idStr } = await ctx.params;
    const id = parseId(idStr);
    if (id === null) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    let provider: "claude" | "gemini" | undefined;
    try {
      const text = await req.text();
      if (text) {
        const json = JSON.parse(text);
        const parsed = bodySchema.safeParse(json);
        if (!parsed.success) {
          return NextResponse.json(
            { error: parsed.error.flatten() },
            { status: 400 },
          );
        }
        provider = parsed.data.provider;
      }
    } catch {
      // empty/invalid body is OK — use default provider.
    }
    const cv = await reparseCv(id, provider);
    return NextResponse.json(cv);
  },
);
