// POST /api/companies/[id]/offices  → add a manual office row
// DELETE /api/companies/[id]/offices?officeId=N → remove one
//
// Used by the "Add office" surface on /companies/[id] when the user wants
// to record a location that the auto-extractor missed.

import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { wrap } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { geocode } from "@/lib/companies/geo";
import { upsertOffice } from "@/lib/repo/company-siblings";

export const runtime = "nodejs";

const bodySchema = z.object({
  label: z.string().trim().max(120).optional().default(""),
  address: z.string().trim().min(2).max(500),
});

export const POST = wrap(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    const numericId = Number(id);
    if (!Number.isFinite(numericId) || numericId <= 0) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
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
    let lat: number | null = null;
    let lng: number | null = null;
    let displayName: string | null = null;
    try {
      const point = await geocode(parsed.data.address);
      if (point) {
        lat = point.lat;
        lng = point.lng;
        displayName = point.displayName;
      }
    } catch {
      // geocode failed — still record the office text, just without coords
    }
    const office = await upsertOffice(numericId, {
      label: parsed.data.label,
      address: displayName ?? parsed.data.address,
      lat,
      lng,
    });
    return NextResponse.json({ office }, { status: 201 });
  },
);

export const DELETE = wrap(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    const url = new URL(req.url);
    const officeId = Number(url.searchParams.get("officeId"));
    if (!Number.isFinite(officeId) || officeId <= 0) {
      return NextResponse.json({ error: "Invalid officeId" }, { status: 400 });
    }
    const db = getDb();
    const removed = await db
      .delete(schema.companyOffices)
      .where(
        and(
          eq(schema.companyOffices.id, officeId),
          eq(schema.companyOffices.companyId, Number(id)),
        ),
      )
      .returning({ id: schema.companyOffices.id });
    return NextResponse.json({ removed: removed.length });
  },
);
