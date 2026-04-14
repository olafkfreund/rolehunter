import { NextResponse } from "next/server";
import { unlink } from "node:fs/promises";
import { z } from "zod";
import { absoluteUploadPath } from "@/lib/upload";
import {
  deleteVariant,
  getVariant,
  updateVariant,
} from "@/lib/repo/variants";
import { wrap } from "@/lib/api";

export const runtime = "nodejs";

const patchSchema = z
  .object({
    tailoredMarkdown: z.string().min(1).optional(),
    keywords: z.array(z.string()).optional(),
    theme: z.enum(["modern", "classic"]).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field required",
  });

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const parsedId = parseId(id);
  if (parsedId === null) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const variant = await getVariant(parsedId);
  if (!variant) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(variant);
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const parsedId = parseId(id);
  if (parsedId === null) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const variant = await getVariant(parsedId);
  if (!variant) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (variant.pdfPath) {
    try {
      const abs = absoluteUploadPath(variant.pdfPath);
      await unlink(abs);
    } catch {
      // file may already be gone; ignore
    }
  }

  await deleteVariant(parsedId);
  return NextResponse.json({ ok: true });
}

export const PATCH = wrap(async (
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) => {
  const { id } = await ctx.params;
  const parsedId = parseId(id);
  if (parsedId === null) {
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
  const existing = await getVariant(parsedId);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const updated = await updateVariant(parsedId, {
    tailoredMarkdown: parsed.data.tailoredMarkdown,
    keywords: parsed.data.keywords,
    theme: parsed.data.theme,
  });
  return NextResponse.json(updated);
});
