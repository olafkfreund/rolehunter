// POST /api/admin/refresh-offices
//
// Walks every company in the DB and runs extractOfficesFromJobs on it.
// Used by the "Refresh all offices" button on /companies to backfill the
// office data so the city-matched-office picker (PR #83) has real data
// to work with across the full company set, not just one at a time.
//
// Rate-limited internally so Nominatim doesn't shed us. Capped per call
// so the route doesn't blow the default 60s timeout — callers can repeat
// until `remaining` is 0.

import { NextResponse } from "next/server";
import { wrap } from "@/lib/api";
import { backfillAllCompanyOffices } from "@/lib/companies/extract-offices";

export const runtime = "nodejs";
export const maxDuration = 120;

export const POST = wrap(async (req: Request) => {
  const url = new URL(req.url);
  const limitParam = url.searchParams.get("limit");
  const parsedLimit = limitParam ? Number(limitParam) : NaN;
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 50) : 12;
  const result = await backfillAllCompanyOffices({ limit });
  const totalWritten = result.processed.reduce((s, r) => s + r.written, 0);
  return NextResponse.json({
    processedCount: result.processed.length,
    remaining: result.remaining,
    totalOfficesWritten: totalWritten,
    details: result.processed,
  });
});
