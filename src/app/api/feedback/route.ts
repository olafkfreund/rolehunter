import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/lib/api";
import {
  createFeedback,
  listAllWithJob,
  listForApplication,
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

const postSchema = z.object({
  applicationId: z.number().int().positive(),
  interviewId: z.number().int().positive().nullable().optional(),
  source: sourceEnum.optional(),
  rejectionCategory: rejectionEnum.nullable().optional(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  whatWentWellMd: z.string().max(20000).optional(),
  whatWentBadlyMd: z.string().max(20000).optional(),
  whatToChangeMd: z.string().max(20000).optional(),
  recruiterVerbatim: z.string().max(20000).nullable().optional(),
});

export const GET = wrap(async (req: Request) => {
  const url = new URL(req.url);
  const appIdRaw = url.searchParams.get("appId");
  const limitRaw = url.searchParams.get("limit");

  if (appIdRaw) {
    const appId = Number(appIdRaw);
    if (!Number.isInteger(appId) || appId <= 0) {
      return NextResponse.json({ error: "Invalid appId" }, { status: 400 });
    }
    const rows = await listForApplication(appId);
    return NextResponse.json(rows);
  }

  const limit = limitRaw ? Number(limitRaw) : 50;
  const clamped =
    Number.isFinite(limit) && Number.isInteger(limit) && limit > 0
      ? Math.min(limit, 200)
      : 50;
  const rows = await listAllWithJob(clamped);
  return NextResponse.json(rows);
});

export const POST = wrap(async (req: Request) => {
  const body = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const created = await createFeedback(parsed.data);
  return NextResponse.json(created, { status: 201 });
});
