// POST /api/profile/skill-override
//   { token: "Java", action: "match" | "miss" | "clear" }
//
// Wired by the chips on /jobs/[id]'s fit dashboard. Each click cycles the
// chip state and re-saves; the page revalidates and re-runs computeFitReport
// so the new score reflects the override.

import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/lib/api";
import { setSkillOverride } from "@/lib/repo/skill-overrides";

export const runtime = "nodejs";

const bodySchema = z.object({
  token: z.string().trim().min(1).max(120),
  action: z.enum(["match", "miss", "clear"]),
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
  const overrides = await setSkillOverride(parsed.data.token, parsed.data.action);
  return NextResponse.json({ overrides });
});
