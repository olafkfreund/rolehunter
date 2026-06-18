import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/lib/api";
import { deleteProfile, getProfile, updateProfile } from "@/lib/repo/searchProfiles";

export const runtime = "nodejs";

const VALID_SOURCES = [
  "paste",
  "jsearch",
  "linkedin",
  "adzuna",
  "indeed",
  "dice",
  "jobspy",
  "apify",
  "greenhouse",
  "lever",
  "workday",
  "workable",
  "ashby",
  "smartrecruiters",
  "company_sites",
  "arbeitnow",
  "bundesagentur",
  "remotive",
  "jobicy",
  "remoteok",
  "himalayas",
] as const;

const VALID_REMOTE = ["remote", "hybrid", "onsite"] as const;

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    query: z.string().trim().min(1),
    location: z.string().trim().max(200).nullable(),
    locationRadiusKm: z.coerce.number().int().min(0).max(500).nullable(),
    salaryMinUsd: z.coerce.number().int().min(0).nullable(),
    salaryMaxUsd: z.coerce.number().int().min(0).nullable(),
    salaryCurrency: z.string().trim().max(8).nullable(),
    remoteModes: z.array(z.enum(VALID_REMOTE)),
    experienceLevels: z.array(z.string()),
    jobTypes: z.array(z.string()),
    sources: z.array(z.enum(VALID_SOURCES)).min(1),
    companies: z.array(z.string().trim().min(1).max(200)).max(50),
    frequency: z.enum(["hourly", "every_4h", "daily", "weekly"]),
    maxResultsPerRun: z.coerce.number().int().min(1).max(200),
    active: z.coerce.boolean(),
  })
  .partial();

function parseId(s: string): number | null {
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export const GET = wrap(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id: idStr } = await ctx.params;
    const id = parseId(idStr);
    if (id === null) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const profile = await getProfile(id);
    if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(profile);
  },
);

export const PATCH = wrap(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id: idStr } = await ctx.params;
    const id = parseId(idStr);
    if (id === null) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const body = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") },
        { status: 400 },
      );
    }
    const profile = await updateProfile(id, parsed.data);
    if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(profile);
  },
);

export const DELETE = wrap(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id: idStr } = await ctx.params;
    const id = parseId(idStr);
    if (id === null) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const ok = await deleteProfile(id);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ deleted: true });
  },
);
