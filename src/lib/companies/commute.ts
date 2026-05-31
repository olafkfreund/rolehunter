// Google Maps Distance Matrix wrapper for real commute time + cost.
//
// Setup: provision a Google Maps Platform API key with Distance Matrix
// enabled and set GOOGLE_MAPS_API_KEY. Without the key, every call
// returns null and the Logistics dimension falls back to haversine.
//
// Cost discipline: caches per (origin, destination, mode) in memory with
// a 24h TTL. One commute lookup per (home, HQ) per day per mode. At ~$5
// CPM that's effectively free for a single-user self-hosted setup.

export type TransportMode = "driving" | "transit" | "bicycling" | "walking";

export interface CommuteEstimate {
  durationMinutes: number; // travel time in minutes
  distanceKm: number;
  mode: TransportMode;
  costEstimateUsd: number | null;
  asOf: string;
}

interface CacheEntry {
  fetchedAt: number;
  payload: CommuteEstimate;
}

const TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

function key(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  mode: TransportMode,
): string {
  return `${origin.lat.toFixed(4)},${origin.lng.toFixed(4)}->${destination.lat.toFixed(
    4,
  )},${destination.lng.toFixed(4)}::${mode}`;
}

// Rough $/km tariffs. Configurable per-region in future; for now we treat
// these as illustrative round-trip estimates a user can sanity-check.
const COST_PER_KM_USD: Record<TransportMode, number | null> = {
  driving: 0.6, // fuel + wear at ~UK petrol prices
  transit: 0.25, // public transit average per km
  bicycling: 0.02,
  walking: 0,
};

function estimateCost(distanceKm: number, mode: TransportMode): number | null {
  const ratePerKm = COST_PER_KM_USD[mode];
  if (ratePerKm === null) return null;
  // Round-trip 22 working days × 2 trips
  return Math.round(distanceKm * 2 * 22 * ratePerKm);
}

interface DistanceMatrixResponse {
  status: string;
  rows: Array<{
    elements: Array<{
      status: string;
      duration?: { value: number; text: string };
      distance?: { value: number; text: string };
    }>;
  }>;
}

export interface FetchCommuteOptions {
  /** Read this env var instead of GOOGLE_MAPS_API_KEY (used by tests). */
  apiKeyOverride?: string;
}

/**
 * Look up real commute time + distance for (origin, destination, mode).
 * Returns null if no API key is configured, the upstream call fails, or
 * Google says the route isn't reachable.
 */
export async function fetchCommuteEstimate(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  mode: TransportMode,
  opts: FetchCommuteOptions = {},
): Promise<CommuteEstimate | null> {
  const apiKey = opts.apiKeyOverride ?? process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;
  if (
    !Number.isFinite(origin.lat) ||
    !Number.isFinite(origin.lng) ||
    !Number.isFinite(destination.lat) ||
    !Number.isFinite(destination.lng)
  )
    return null;

  const ck = key(origin, destination, mode);
  const cached = cache.get(ck);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return cached.payload;
  }

  const url =
    `https://maps.googleapis.com/maps/api/distancematrix/json` +
    `?origins=${origin.lat},${origin.lng}` +
    `&destinations=${destination.lat},${destination.lng}` +
    `&mode=${mode}` +
    `&units=metric` +
    `&key=${encodeURIComponent(apiKey)}`;

  let raw: DistanceMatrixResponse;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    raw = (await res.json()) as DistanceMatrixResponse;
  } catch {
    return null;
  }
  if (raw.status !== "OK") return null;
  const element = raw.rows?.[0]?.elements?.[0];
  if (!element || element.status !== "OK" || !element.duration || !element.distance) {
    return null;
  }
  const distanceKm = element.distance.value / 1000;
  const durationMinutes = Math.round(element.duration.value / 60);
  const payload: CommuteEstimate = {
    durationMinutes,
    distanceKm,
    mode,
    costEstimateUsd: estimateCost(distanceKm, mode),
    asOf: new Date().toISOString().slice(0, 10),
  };
  cache.set(ck, { fetchedAt: Date.now(), payload });
  return payload;
}

export function _resetCommuteCache(): void {
  cache.clear();
}

/** Map the user's preferredTransportMode (profile column) to Google's enum. */
export function profileModeToGoogle(
  mode: string | null | undefined,
): TransportMode {
  switch (mode) {
    case "car":
      return "driving";
    case "transit":
      return "transit";
    case "bike":
      return "bicycling";
    case "walk":
      return "walking";
    default:
      return "driving";
  }
}
