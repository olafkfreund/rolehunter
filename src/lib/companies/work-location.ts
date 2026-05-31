// Resolves the right (lat, lng) to use as the company's *work location* for
// a given user — preferring a city-matched office over the HQ when one
// exists. This is the single entry point every distance calculation should
// go through; nothing else should read company.hqLat/hqLng directly.

import type { Company, Profile } from "@/lib/db/schema";
import { listOffices } from "@/lib/repo/company-siblings";
import { haversineKm, type GeoPoint } from "./geo";
import { type OfficePickResult, pickBestOffice } from "./pick-office";

export interface ResolvedWorkLocation extends OfficePickResult {
  /** Distance hint (km) — only set when both user point and resolved point exist. */
  fromUserKm: number | null;
}

/**
 * Look up the right work-location point for (company, profile). Reads the
 * company's offices from the DB. Returns null when neither HQ nor any
 * geocoded office is available.
 *
 * Distance is NOT computed here — callers do it after, so they can use
 * either haversine or Google Maps Distance Matrix.
 */
export async function resolveWorkLocation(
  company: Company,
  profile: Profile | null,
): Promise<OfficePickResult | null> {
  const offices = await listOffices(company.id);
  const userPoint: GeoPoint | null =
    profile?.homeLat != null && profile?.homeLng != null
      ? { lat: profile.homeLat, lng: profile.homeLng, displayName: "" }
      : null;
  const hqPoint: GeoPoint | null =
    company.hqLat != null && company.hqLng != null
      ? { lat: company.hqLat, lng: company.hqLng, displayName: "" }
      : null;
  const hqLabel = company.headquarters
    ? `HQ ${company.headquarters}`
    : "HQ";

  return pickBestOffice({
    userLocation: profile?.location ?? null,
    userPoint,
    hqPoint,
    hqLabel,
    offices,
  });
}

/**
 * Convenience: return just the haversine distance from the user's home to
 * the resolved work location, plus a one-line "which office we used" label
 * the UI can render alongside. Null when distance can't be computed.
 */
export async function resolveDistanceKm(
  company: Company,
  profile: Profile | null,
): Promise<{ km: number; label: string; source: OfficePickResult["source"] } | null> {
  if (profile?.homeLat == null || profile?.homeLng == null) return null;
  const wl = await resolveWorkLocation(company, profile);
  if (!wl) return null;
  const km = haversineKm(
    { lat: profile.homeLat, lng: profile.homeLng, displayName: "" },
    wl.point,
  );
  return { km, label: wl.label, source: wl.source };
}
