import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/lib/api";
import {
  deleteFeedback,
  getFeedback,
  updateFeedback,
} from "@/lib/repo/feedback";

export const runtime = "nodejs";

const sourceEnum = z.enum(["recruiter", "self", "llm_synthesis"]);
const rejectionEnum = z.enum([
  "resume_screen",
  "technical",
  "behavioral",
  "culture",
  "salary",
  "position_closed",
  "other",
]);

const patchSchema = z.object({
  interviewId: z.number().int().positive().nullable().optional(),
  source: sourceEnum.optional(),
  rejectionCategory: rejectionEnum.nullable().optional(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  whatWentWellMd: z.string().max(20000).optional(),
  whatWentBadlyMd: z.string().max(20000).optional(),
  whatToChangeMd: z.string().max(20000).optional(),
  recruiterVerbatim: z.string().max(20000).nullable().optional(),
});

function parseId(idStr: string): number | null {
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

export const GET = wrap(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id: idStr } = await ctx.params;
    const id = parseId(idStr);
    if (id === null) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const row = await getFeedback(id);
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(row);
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

    const updated = await updateFeedback(id, parsed.data);
    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
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
    await deleteFeedback(id);
    return NextResponse.json({ ok: true });
  },
);
