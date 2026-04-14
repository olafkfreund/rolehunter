import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/lib/api";
import {
  deleteTemplate,
  getTemplate,
  updateTemplate,
} from "@/lib/repo/coverLetters";

export const runtime = "nodejs";

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  bodyMd: z.string().max(50000).optional(),
  isDefault: z.boolean().optional(),
});

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
    const template = await getTemplate(id);
    if (!template) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(template);
  },
);

export const PATCH = wrap(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id: idStr } = await ctx.params;
    const id = parseId(idStr);
    if (id === null) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const body = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const updated = await updateTemplate(id, parsed.data);
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
    await deleteTemplate(id);
    return NextResponse.json({ ok: true });
  },
);
