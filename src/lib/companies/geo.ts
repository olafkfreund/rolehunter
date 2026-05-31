// Free geocoding via OpenStreetMap Nominatim + haversine distance.
// Nominatim: 1 req/sec rate limit, requires User-Agent. Per their policy
// (https://operations.osmfoundation.org/policies/nominatim/) single-user
// occasional lookups are explicitly allowed.

export interface GeoPoint {
  lat: number;
  lng: number;
  displayName: string;
}

export async function geocode(address: string): Promise<GeoPoint | null> {
  const q = address.trim();
  if (!q) return null;
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "rolehunter/3.2 (+https://github.com/olafkfreund/rolehunter; olaf@freundcloud.com)",
      Accept: "application/json",
      "Accept-Language": "en",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    if (res.status === 429) throw new Error("Nominatim rate-limited. Try again in a moment.");
    throw new Error(`Nominatim ${res.status}: ${res.statusText}`);
  }
  const data = (await res.json()) as Array<{
    lat: string;
    lon: string;
    display_name: string;
  }>;
  if (!data.length) return null;
  const lat = Number(data[0].lat);
  const lng = Number(data[0].lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, displayName: data[0].display_name };
}

/** Haversine great-circle distance in kilometres. */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371; // km
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}
