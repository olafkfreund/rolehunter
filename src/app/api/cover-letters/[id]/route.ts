import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/lib/api";
import {
  deleteCoverLetter,
  getCoverLetter,
  updateCoverLetter,
} from "@/lib/repo/coverLetters";

export const runtime = "nodejs";

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && Number.isInteger(n) && n > 0 ? n : null;
}

export const GET = wrap(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id: idStr } = await ctx.params;
    const id = parseId(idStr);
    if (id === null) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const letter = await getCoverLetter(id);
    if (!letter) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(letter);
  },
);

export const DELETE = wrap(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id: idStr } = await ctx.params;
    const id = parseId(idStr);
    if (id === null) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    await deleteCoverLetter(id);
    return NextResponse.json({ ok: true });
  },
);

const patchSchema = z
  .object({
    theme: z.enum(["modern", "classic"]).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field required",
  });

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
    try {
      const updated = await updateCoverLetter(id, {
        theme: parsed.data.theme,
      });
      return NextResponse.json(updated);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("not found")) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      throw err;
    }
  },
);
