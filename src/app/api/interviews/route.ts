import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/lib/api";
import {
  createInterview,
  listAllWithJob,
  listForApplication,
  listUpcoming,
  type InterviewStatus,
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

const postSchema = z.object({
  applicationId: z.number().int().positive(),
  scheduledAt: z.string().datetime(),
  durationMin: z.number().int().positive().max(24 * 60).optional(),
  type: typeSchema,
  status: statusSchema.optional(),
  interviewerName: z.string().max(200).optional(),
  interviewerTitle: z.string().max(200).optional(),
  meetingUrl: z.union([z.string().url(), z.literal("")]).optional(),
  locationText: z.string().max(500).optional(),
  prepNotesMd: z.string().max(20000).optional(),
  postNotesMd: z.string().max(20000).optional(),
});

export const GET = wrap(async (req: Request) => {
  const url = new URL(req.url);
  const appIdParam = url.searchParams.get("appId");
  const upcoming = url.searchParams.get("upcoming");
  const statusParam = url.searchParams.get("status");

  if (appIdParam) {
    const appId = Number(appIdParam);
    if (!Number.isInteger(appId) || appId <= 0) {
      return NextResponse.json({ error: "Invalid appId" }, { status: 400 });
    }
    const rows = await listForApplication(appId);
    return NextResponse.json(rows);
  }

  if (upcoming === "1") {
    const daysParam = url.searchParams.get("days");
    const days = daysParam ? Number(daysParam) : 14;
    const rows = await listUpcoming(
      Number.isFinite(days) && days > 0 ? days : 14,
    );
    return NextResponse.json(rows);
  }

  let status: InterviewStatus | undefined;
  if (statusParam) {
    const parsed = statusSchema.safeParse(statusParam);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    status = parsed.data;
  }
  const rows = await listAllWithJob(status);
  return NextResponse.json(rows);
});

export const POST = wrap(async (req: Request) => {
  const body = await req.json();
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const v = parsed.data;
  const created = await createInterview({
    applicationId: v.applicationId,
    scheduledAt: new Date(v.scheduledAt),
    durationMin: v.durationMin,
    type: v.type,
    status: v.status,
    interviewerName: v.interviewerName ?? null,
    interviewerTitle: v.interviewerTitle ?? null,
    meetingUrl: v.meetingUrl ? v.meetingUrl : null,
    locationText: v.locationText ?? null,
    prepNotesMd: v.prepNotesMd,
    postNotesMd: v.postNotesMd,
  });
  return NextResponse.json(created, { status: 201 });
});
