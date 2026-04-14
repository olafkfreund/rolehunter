import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/lib/api";
import { fetchResourcesForGap } from "@/lib/repo/gaps";

export const runtime = "nodejs";
export const maxDuration = 90;

const bodySchema = z.object({
  provider: z.enum(["claude", "gemini"]).optional(),
});

function parseId(raw: string): number | null {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

export const POST = wrap(async (
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) => {
  const { id: idStr } = await ctx.params;
  const id = parseId(idStr);
  if (id === null) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
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
  const resources = await fetchResourcesForGap(id, provider);
  return NextResponse.json(resources);
});
