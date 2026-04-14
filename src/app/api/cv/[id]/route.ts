import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/lib/api";
import { deleteCv, getCv, updateCv } from "@/lib/repo/cv";
import type { CvJson } from "@/lib/llm/types";

export const runtime = "nodejs";

function parseId(idStr: string): number | null {
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

const patchSchema = z.object({
  title: z.string().max(200).optional(),
  rawMarkdown: z.string().optional(),
  parsedJson: z.any().optional(),
});

export const GET = wrap(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id: idStr } = await ctx.params;
    const id = parseId(idStr);
    if (id === null) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const cv = await getCv(id);
    if (!cv) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(cv);
  },
);

export const PATCH = wrap(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id: idStr } = await ctx.params;
    const id = parseId(idStr);
    if (id === null) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const updated = await updateCv(id, {
      title: parsed.data.title,
      rawMarkdown: parsed.data.rawMarkdown,
      parsedJson: parsed.data.parsedJson as CvJson | undefined,
    });
    return NextResponse.json(updated);
  },
);

export const DELETE = wrap(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id: idStr } = await ctx.params;
    const id = parseId(idStr);
    if (id === null) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    try {
      await deleteCv(id);
      return NextResponse.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/Cannot delete the active CV/i.test(message)) {
        return NextResponse.json({ error: message }, { status: 409 });
      }
      throw err;
    }
  },
);
