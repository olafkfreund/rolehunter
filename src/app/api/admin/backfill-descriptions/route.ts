// POST /api/admin/backfill-descriptions?limit=N
//
// Sweeps job_listings rows that arrived without a description and fetches
// the full body. Re-callable until `remaining` is 0.

import { NextResponse } from "next/server";
import { wrap } from "@/lib/api";
import {
  backfillEmptyDescriptions,
  countEmptyDescriptionsBySource,
} from "@/lib/jobs/backfill-descriptions";

export const runtime = "nodejs";
export const maxDuration = 180;

export const GET = wrap(async () => {
  const bySource = await countEmptyDescriptionsBySource();
  const total = Object.values(bySource).reduce((s, n) => s + n, 0);
  return NextResponse.json({ total, bySource });
});

export const POST = wrap(async (req: Request) => {
  const url = new URL(req.url);
  const limitParam = url.searchParams.get("limit");
  const parsedLimit = limitParam ? Number(limitParam) : NaN;
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 25;
  const result = await backfillEmptyDescriptions({ limit });
  return NextResponse.json(result);
});
