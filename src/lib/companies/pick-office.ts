// pick-office.ts — selects the best company location (HQ or a regional office)
// to use as the "work location" for the user's commute-distance calculation.
//
// Today RoleHunter always used companies.hqLat/hqLng. That's wrong when the
// user lives in London and the company has both a Teaneck HQ *and* a London
// office — we should be using London for distance. This module fixes it.
//
// Decision flow:
//   1. If there are no offices on file, return the HQ point (today's behavior)
//   2. Tokenize the user's profile.location ("London, England, UK") and each
//      office.address. Offices that share at least one location token with the
//      user are candidates.
//   3. Among candidates, pick the one with the shortest haversine to the user.
//   4. If no candidate matches, return the HQ — but flag the result so the UI
//      can surface "HQ in Teaneck — no local office for your area".

import type { CompanyOffice } from "@/lib/db/schema";
import { haversineKm, type GeoPoint } from "./geo";

const COMMON_STOPWORDS = new Set([
  "the",
  "of",
  "and",
  "a",
  "an",
  "in",
  "on",
  "at",
  "uk",
  "us",
  "usa",
  "united",
  "kingdom",
  "states",
  "republic",
  "north",
  "south",
  "east",
  "west",
  "city",
  "metro",
  "area",
  "greater",
  "borough",
  "county",
  "district",
  "region",
  "england",
  "scotland",
  "wales",
  "ireland",
]);

export function tokenizeLocation(s: string | null | undefined): Set<string> {
  if (!s) return new Set();
  return new Set(
    s
      .toLowerCase()
      .replace(/[,.;:/()]+/g, " ")
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 3 && !COMMON_STOPWORDS.has(t)),
  );
}

export function locationTokensMatch(
  userLocation: string | null | undefined,
  candidate: string | null | undefined,
): boolean {
  const a = tokenizeLocation(userLocation);
  const b = tokenizeLocation(candidate);
  if (a.size === 0 || b.size === 0) return false;
  for (const t of a) {
    if (b.has(t)) return true;
  }
  return false;
}

export interface OfficePickResult {
  /** The chosen point — either a real office's coords, or HQ as fallback. */
  point: GeoPoint;
  /** Office record that won, or null when we fell back to HQ. */
  office: CompanyOffice | null;
  /** Why this point was chosen — used to render evidence in the UI. */
  source: "office-match-by-token" | "office-closest" | "hq-fallback";
  /** Human-readable label such as "London office" or "HQ Teaneck". */
  label: string;
}

interface PickInputs {
  userLocation: string | null | undefined;
  userPoint: GeoPoint | null;
  hqPoint: GeoPoint | null;
  hqLabel: string; // e.g. "HQ Teaneck"
  offices: CompanyOffice[];
}

/**
 * Pick the best office (or HQ fallback) to use for the user's commute
 * distance calculation. See file header for the decision flow.
 *
 * Returns null when the company has no usable coordinate at all (no HQ + no
 * offices with geocodes) — callers should treat that as "distance n/a".
 */
export function pickBestOffice(input: PickInputs): OfficePickResult | null {
  const geocodedOffices = input.offices.filter(
    (o) => typeof o.lat === "number" && typeof o.lng === "number",
  );

  // Tier 1: office whose address tokens match the user's location
  if (input.userLocation) {
    const matches = geocodedOffices.filter((o) =>
      locationTokensMatch(input.userLocation, o.address),
    );
    if (matches.length > 0) {
      let best = matches[0];
      let bestKm = Number.POSITIVE_INFINITY;
      if (input.userPoint) {
        for (const o of matches) {
          const km = haversineKm(input.userPoint, {
            lat: o.lat!,
            lng: o.lng!,
            displayName: "",
          });
          if (km < bestKm) {
            best = o;
            bestKm = km;
          }
        }
      }
      return {
        point: { lat: best.lat!, lng: best.lng!, displayName: "" },
        office: best,
        source: "office-match-by-token",
        label: best.label ? `${best.label} office` : best.address ?? "regional office",
      };
    }
  }

  // Tier 2: no token match but user point exists → pick the closest office
  // anywhere. This is correct when the user lists their location loosely
  // (e.g. "EU") but an office is genuinely closer than HQ.
  if (input.userPoint && geocodedOffices.length > 0) {
    let best = geocodedOffices[0];
    let bestKm = haversineKm(input.userPoint, {
      lat: best.lat!,
      lng: best.lng!,
      displayName: "",
    });
    for (const o of geocodedOffices.slice(1)) {
      const km = haversineKm(input.userPoint, {
        lat: o.lat!,
        lng: o.lng!,
        displayName: "",
      });
      if (km < bestKm) {
        best = o;
        bestKm = km;
      }
    }
    // Only prefer this office over HQ if it's meaningfully closer.
    if (input.hqPoint) {
      const hqKm = haversineKm(input.userPoint, input.hqPoint);
      if (bestKm < hqKm * 0.75) {
        return {
          point: { lat: best.lat!, lng: best.lng!, displayName: "" },
          office: best,
          source: "office-closest",
          label: best.label
            ? `${best.label} office (closer than HQ)`
            : `${best.address ?? "regional office"} (closer than HQ)`,
        };
      }
    } else {
      // No HQ at all — the closest office wins by default
      return {
        point: { lat: best.lat!, lng: best.lng!, displayName: "" },
        office: best,
        source: "office-closest",
        label: best.label ? `${best.label} office` : best.address ?? "regional office",
      };
    }
  }

  // Tier 3: HQ fallback
  if (input.hqPoint) {
    return {
      point: input.hqPoint,
      office: null,
      source: "hq-fallback",
      label: input.hqLabel,
    };
  }

  return null;
}
