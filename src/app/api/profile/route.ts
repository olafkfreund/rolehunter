import { NextResponse } from "next/server";
import { z } from "zod";
import { getProfile, updateProfile } from "@/lib/repo/profile";
import { geocode } from "@/lib/companies/geo";
import { CULTURE_KEYS } from "@/lib/jobs/fit-score";

export async function GET() {
  const p = await getProfile();
  return NextResponse.json(p);
}

const patchSchema = z.object({
  fullName: z.string().max(200).optional(),
  email: z.string().email().or(z.literal("")).optional(),
  phone: z.string().max(50).optional(),
  location: z.string().max(200).optional(),
  summary: z.string().max(4000).optional(),
  linkedinUrl: z.string().url().or(z.literal("")).optional().nullable(),
  linkedinHeadline: z.string().max(300).optional().nullable(),
  linkedinAbout: z.string().max(8000).optional().nullable(),
  avatarPath: z.string().optional().nullable(),
  homeAddress: z.string().max(500).optional().nullable(),
  salaryTargetMin: z.coerce.number().int().min(0).max(100_000_000).optional().nullable(),
  salaryTargetMax: z.coerce.number().int().min(0).max(100_000_000).optional().nullable(),
  salaryTargetCurrency: z
    .string()
    .trim()
    .max(8)
    .regex(/^[A-Z]{0,8}$/i, "Currency must be ASCII letters")
    .optional()
    .nullable(),
  salaryTargetPeriod: z
    .enum(["annual", "monthly", "daily", "hourly"])
    .optional()
    .nullable(),
  workModePreference: z
    .enum(["remote", "hybrid", "onsite", "any"])
    .optional()
    .nullable(),
  maxOfficeDaysPerWeek: z.coerce.number().int().min(0).max(7).optional().nullable(),
  cultureLikes: z
    .array(z.enum(CULTURE_KEYS as unknown as [string, ...string[]]))
    .max(CULTURE_KEYS.length)
    .optional(),
  cultureAvoids: z
    .array(z.enum(CULTURE_KEYS as unknown as [string, ...string[]]))
    .max(CULTURE_KEYS.length)
    .optional(),
});

export async function PATCH(req: Request) {
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  // If homeAddress changed, geocode best-effort via OSM Nominatim.
  // Failure to geocode doesn't block the save — we just save without coords.
  const patch: Record<string, unknown> = { ...data };
  if (data.homeAddress !== undefined) {
    const addr = (data.homeAddress ?? "").trim();
    if (!addr) {
      patch.homeAddress = null;
      patch.homeLat = null;
      patch.homeLng = null;
      patch.homeGeocodedAt = null;
    } else {
      try {
        const point = await geocode(addr);
        if (point) {
          patch.homeLat = point.lat;
          patch.homeLng = point.lng;
          patch.homeGeocodedAt = new Date();
        }
      } catch {
        // Keep the address text even if geocoding failed.
      }
    }
  }

  // Normalise empty strings on the salary fields to nulls (form sends "" not undefined)
  if (patch.salaryTargetMin === 0 && data.salaryTargetMin === null) patch.salaryTargetMin = null;
  if (patch.salaryTargetMax === 0 && data.salaryTargetMax === null) patch.salaryTargetMax = null;
  if (typeof patch.salaryTargetCurrency === "string") {
    patch.salaryTargetCurrency = patch.salaryTargetCurrency.trim().toUpperCase() || null;
  }

  // If a band is provided ensure min <= max; swap rather than reject so the
  // user doesn't have to know which field is which.
  if (
    typeof patch.salaryTargetMin === "number" &&
    typeof patch.salaryTargetMax === "number" &&
    patch.salaryTargetMin > patch.salaryTargetMax
  ) {
    const a = patch.salaryTargetMin;
    patch.salaryTargetMin = patch.salaryTargetMax;
    patch.salaryTargetMax = a;
  }

  // De-conflict culture likes/avoids: if a key appears in both, drop it from
  // both (treat as no-opinion). Keeps the UI honest if the user toggles a
  // chip into both columns.
  if (Array.isArray(patch.cultureLikes) && Array.isArray(patch.cultureAvoids)) {
    const both = new Set(
      (patch.cultureLikes as string[]).filter((k) =>
        (patch.cultureAvoids as string[]).includes(k),
      ),
    );
    if (both.size > 0) {
      patch.cultureLikes = (patch.cultureLikes as string[]).filter((k) => !both.has(k));
      patch.cultureAvoids = (patch.cultureAvoids as string[]).filter((k) => !both.has(k));
    }
  }

  const updated = await updateProfile(patch);
  return NextResponse.json(updated);
}
