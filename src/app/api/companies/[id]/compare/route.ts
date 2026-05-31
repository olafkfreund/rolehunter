// GET /api/companies/[id]/compare — returns a slim shape for the side-by-side
// comparison drawer, including distanceKm computed from the user's home address.

import { NextResponse } from "next/server";
import { wrap } from "@/lib/api";
import { getCompanyById } from "@/lib/repo/companies";
import { getProfile } from "@/lib/repo/profile";
import { haversineKm } from "@/lib/companies/geo";

export const runtime = "nodejs";

export const GET = wrap(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId) || !Number.isInteger(numericId) || numericId <= 0) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const company = await getCompanyById(numericId);
  if (!company) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const profile = await getProfile();
  let distanceKm: number | null = null;
  if (
    company.hqLat != null &&
    company.hqLng != null &&
    profile.homeLat != null &&
    profile.homeLng != null
  ) {
    distanceKm = haversineKm(
      { lat: profile.homeLat, lng: profile.homeLng, displayName: "" },
      { lat: company.hqLat, lng: company.hqLng, displayName: "" },
    );
  }
  return NextResponse.json({
    company: {
      id: company.id,
      name: company.name,
      headquarters: company.headquarters,
      glassdoorRating: company.glassdoorRating,
      glassdoorRecommendPct: company.glassdoorRecommendPct,
      foundedYear: company.foundedYear,
      hasRecentLayoff: company.hasRecentLayoff,
      distanceKm,
    },
  });
});
