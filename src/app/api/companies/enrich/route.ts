import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/lib/api";
import { ensureCompanyForJob } from "@/lib/repo/companies";
import { getProfile } from "@/lib/repo/profile";
import { haversineKm } from "@/lib/companies/geo";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  jobId: z.coerce.number().int().positive(),
  force: z.boolean().optional().default(false),
});

export const POST = wrap(async (req: Request) => {
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") },
      { status: 400 },
    );
  }
  const company = await ensureCompanyForJob(parsed.data.jobId, {
    force: parsed.data.force,
  });
  if (!company) {
    return NextResponse.json(
      { error: "Job has no company name to enrich" },
      { status: 412 },
    );
  }

  // Compute haversine distance from the user's home address if both points
  // are known. Slice 2 only — actual commute time + cost arrives in slice 3
  // via Google Maps Distance Matrix.
  let distanceKm: number | null = null;
  if (company.hqLat != null && company.hqLng != null) {
    const profile = await getProfile();
    if (profile.homeLat != null && profile.homeLng != null) {
      distanceKm = haversineKm(
        { lat: profile.homeLat, lng: profile.homeLng, displayName: "" },
        { lat: company.hqLat, lng: company.hqLng, displayName: "" },
      );
    }
  }

  return NextResponse.json({ company, distanceKm });
});
