// GET /api/companies/[id]/compare — returns a slim shape for the side-by-side
// comparison drawer, including distanceKm computed from the user's home address.

import { NextResponse } from "next/server";
import { wrap } from "@/lib/api";
import { getCompanyById } from "@/lib/repo/companies";
import { getProfile } from "@/lib/repo/profile";
import { resolveDistanceKm } from "@/lib/companies/work-location";

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
  const resolved = await resolveDistanceKm(company, profile);
  const distanceKm = resolved?.km ?? null;
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
