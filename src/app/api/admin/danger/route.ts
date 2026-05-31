// POST /api/admin/danger
//   { action: "...", confirmPhrase: "...", payload?: {...} }
//
// Single endpoint for every destructive bulk operation. The confirmPhrase
// must exactly match CONFIRM_PHRASES[action] — that's the only protection
// against accidental clicks. Single-user self-hosted threat model.

import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/lib/api";
import {
  CONFIRM_PHRASES,
  deleteAllApplications,
  deleteAllCompanies,
  deleteAllJobs,
  deleteAllPortfolio,
  deleteHiddenJobs,
  deleteJobsByLocationSubstring,
  fullReset,
  type DangerAction,
} from "@/lib/repo/danger-zone";

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z.object({
  action: z.enum([
    "jobs_in_zone",
    "hidden_jobs",
    "all_jobs",
    "all_portfolio",
    "all_applications",
    "all_companies",
    "full_reset",
  ]),
  confirmPhrase: z.string(),
  payload: z
    .object({
      /** Case-insensitive substring match against job_listings.location.
       *  Use ", US" / "United States" / "London" / "California" etc. */
      locationSubstring: z.string().trim().min(1).max(120).optional(),
    })
    .optional(),
});

export const POST = wrap(async (req: Request) => {
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      },
      { status: 400 },
    );
  }
  const { action, confirmPhrase, payload } = parsed.data;

  const expected = CONFIRM_PHRASES[action as DangerAction];
  if (confirmPhrase !== expected) {
    return NextResponse.json(
      { error: `confirmation phrase mismatch — expected "${expected}"` },
      { status: 400 },
    );
  }

  switch (action) {
    case "jobs_in_zone": {
      const needle = payload?.locationSubstring;
      if (!needle) {
        return NextResponse.json(
          { error: "payload.locationSubstring required" },
          { status: 400 },
        );
      }
      const removed = await deleteJobsByLocationSubstring(needle);
      return NextResponse.json({ action, locationSubstring: needle, removed });
    }
    case "hidden_jobs":
      return NextResponse.json({ action, removed: await deleteHiddenJobs() });
    case "all_jobs":
      return NextResponse.json({ action, removed: await deleteAllJobs() });
    case "all_portfolio":
      return NextResponse.json({ action, removed: await deleteAllPortfolio() });
    case "all_applications":
      return NextResponse.json({
        action,
        removed: await deleteAllApplications(),
      });
    case "all_companies":
      return NextResponse.json({ action, removed: await deleteAllCompanies() });
    case "full_reset": {
      const counts = await fullReset();
      return NextResponse.json({ action, counts });
    }
  }
});
