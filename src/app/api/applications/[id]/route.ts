import { NextResponse } from "next/server";
import { z } from "zod";
import {
  deleteApplication,
  updateApplication,
} from "@/lib/repo/applications";
import { wrap } from "@/lib/api";

export const runtime = "nodejs";

const stageSchema = z.enum([
  "saved",
  "applied",
  "phone",
  "onsite",
  "offer",
  "rejected",
]);
const prioritySchema = z.enum(["low", "medium", "high"]);

const patchSchema = z.object({
  stage: stageSchema.optional(),
  priority: prioritySchema.optional(),
  notesMd: z.string().max(20000).optional(),
  reminderAt: z.string().datetime().nullable().optional(),
  lastContact: z.string().datetime().nullable().optional(),
  excitement: z.number().int().min(1).max(5).nullable().optional(),
});

function parseId(idStr: string): number | null {
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

export const PATCH = wrap(async (
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) => {
  const { id: idStr } = await ctx.params;
  const id = parseId(idStr);
  if (id === null) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { stage, priority, notesMd, reminderAt, lastContact, excitement } = parsed.data;
  if (
    stage === undefined &&
    priority === undefined &&
    notesMd === undefined &&
    reminderAt === undefined &&
    lastContact === undefined &&
    excitement === undefined
  ) {
    return NextResponse.json({ error: "No changes provided" }, { status: 400 });
  }
  const result = await updateApplication(id, {
    stage,
    priority,
    notesMd,
    reminderAt:
      reminderAt === undefined ? undefined : reminderAt === null ? null : new Date(reminderAt),
    lastContact:
      lastContact === undefined ? undefined : lastContact === null ? null : new Date(lastContact),
    excitement,
  });
  return NextResponse.json(result);
});

export const DELETE = wrap(async (
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) => {
  const { id: idStr } = await ctx.params;
  const id = parseId(idStr);
  if (id === null) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  await deleteApplication(id);
  return NextResponse.json({ ok: true });
});
