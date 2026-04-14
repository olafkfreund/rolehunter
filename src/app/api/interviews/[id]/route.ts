import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/lib/api";
import {
  deleteInterview,
  getInterview,
  updateInterview,
  type InterviewUpdateInput,
} from "@/lib/repo/interviews";

export const runtime = "nodejs";

const typeSchema = z.enum([
  "phone",
  "video",
  "onsite",
  "take_home",
  "technical",
  "system_design",
  "behavioral",
  "final",
]);

const statusSchema = z.enum([
  "scheduled",
  "completed",
  "cancelled",
  "no_show",
]);

const patchSchema = z.object({
  scheduledAt: z.string().datetime().optional(),
  durationMin: z.number().int().positive().max(24 * 60).optional(),
  type: typeSchema.optional(),
  status: statusSchema.optional(),
  interviewerName: z.string().max(200).nullable().optional(),
  interviewerTitle: z.string().max(200).nullable().optional(),
  meetingUrl: z
    .union([z.string().url(), z.literal(""), z.null()])
    .optional(),
  locationText: z.string().max(500).nullable().optional(),
  prepNotesMd: z.string().max(20000).optional(),
  postNotesMd: z.string().max(20000).optional(),
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
    const row = await getInterview(id);
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
    const existing = await getInterview(id);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const v = parsed.data;

    const patch: InterviewUpdateInput = {};
    if (v.scheduledAt !== undefined) patch.scheduledAt = new Date(v.scheduledAt);
    if (v.durationMin !== undefined) patch.durationMin = v.durationMin;
    if (v.type !== undefined) patch.type = v.type;
    if (v.status !== undefined) patch.status = v.status;
    if (v.interviewerName !== undefined) patch.interviewerName = v.interviewerName;
    if (v.interviewerTitle !== undefined)
      patch.interviewerTitle = v.interviewerTitle;
    if (v.meetingUrl !== undefined)
      patch.meetingUrl = v.meetingUrl ? v.meetingUrl : null;
    if (v.locationText !== undefined) patch.locationText = v.locationText;
    if (v.prepNotesMd !== undefined) patch.prepNotesMd = v.prepNotesMd;
    if (v.postNotesMd !== undefined) patch.postNotesMd = v.postNotesMd;

    const updated = await updateInterview(id, patch);
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
    await deleteInterview(id);
    return NextResponse.json({ ok: true });
  },
);
