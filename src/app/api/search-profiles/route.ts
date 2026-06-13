import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/lib/api";
import { createProfile, listProfiles } from "@/lib/repo/searchProfiles";

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
] as const;

const VALID_REMOTE = ["remote", "hybrid", "onsite"] as const;

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  query: z.string().trim().min(1),
  location: z.string().trim().max(200).optional(),
  locationRadiusKm: z.coerce.number().int().min(0).max(500).optional(),
  salaryMinUsd: z.coerce.number().int().min(0).optional(),
  salaryMaxUsd: z.coerce.number().int().min(0).optional(),
  salaryCurrency: z.string().trim().max(8).optional(),
  remoteModes: z.array(z.enum(VALID_REMOTE)).optional(),
  experienceLevels: z.array(z.string()).optional(),
  jobTypes: z.array(z.string()).optional(),
  sources: z.array(z.enum(VALID_SOURCES)).min(1, "At least one source required"),
  companies: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
  frequency: z.enum(["hourly", "every_4h", "daily", "weekly"]),
  maxResultsPerRun: z.coerce.number().int().min(1).max(200).optional(),
  active: z.coerce.boolean().optional(),
});

export const GET = wrap(async () => {
  const profiles = await listProfiles();
  return NextResponse.json({ count: profiles.length, profiles });
});

export const POST = wrap(async (req: Request) => {
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") },
      { status: 400 },
    );
  }
  const profile = await createProfile(parsed.data);
  return NextResponse.json(profile, { status: 201 });
});
