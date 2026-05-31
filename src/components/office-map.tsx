// Lightweight OpenStreetMap embed using their public iframe.
// Zero JS deps, no API key, no Leaflet bundle — just an <iframe> pointed at
// openstreetmap.org/export/embed.html with a bounding box around the marker.
//
// Used by /companies/[id] and /jobs/[id] to visualize the resolved work
// location (HQ or city-matched office) alongside the user's home if
// they've geocoded it.

interface Props {
  lat: number;
  lng: number;
  label?: string;
  /** Optional second pin (e.g. the user's home) drawn as a separate dot. */
  homeLat?: number | null;
  homeLng?: number | null;
  /** CSS height; defaults to 320px. */
  heightPx?: number;
  /** Tighter bbox = more zoom. 0.05 ≈ ~5 km, 0.5 ≈ ~50 km. */
  pad?: number;
}

function bboxAround(lat: number, lng: number, pad: number): string {
  // OSM bbox format: minLng,minLat,maxLng,maxLat
  const minLng = lng - pad;
  const minLat = lat - pad;
  const maxLng = lng + pad;
  const maxLat = lat + pad;
  return `${minLng}%2C${minLat}%2C${maxLng}%2C${maxLat}`;
}

export function OfficeMap({
  lat,
  lng,
  label,
  homeLat,
  homeLng,
  heightPx = 320,
  pad,
}: Props) {
  // Auto-pick padding from the distance between the two points so both fit.
  let resolvedPad = pad ?? 0.05;
  if (homeLat != null && homeLng != null) {
    const dLat = Math.abs(homeLat - lat);
    const dLng = Math.abs(homeLng - lng);
    resolvedPad = Math.max(resolvedPad, Math.max(dLat, dLng) * 0.7 + 0.02);
  }

  const bbox = bboxAround(lat, lng, resolvedPad);
  const marker = `${lat}%2C${lng}`;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${marker}`;
  const directLink = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=12/${lat}/${lng}`;

  return (
    <div className="rounded-md overflow-hidden border border-[var(--border)] bg-[var(--bg-elev)]">
      <iframe
        src={src}
        loading="lazy"
        title={label ? `Map of ${label}` : "Office map"}
        className="w-full block border-0"
        style={{ height: `${heightPx}px` }}
      />
      <div className="flex items-baseline justify-between gap-2 px-3 py-2 text-[11px] font-mono text-[var(--fg-3)] border-t border-[var(--border)]">
        <span className="truncate">
          {label ? (
            <>
              <span className="text-[var(--accent)]">●</span> {label}
            </>
          ) : (
            <>
              {lat.toFixed(4)}, {lng.toFixed(4)}
            </>
          )}
          {homeLat != null && homeLng != null && (
            <span className="ml-3 text-[var(--fg-4)]">
              · your home {homeLat.toFixed(2)}, {homeLng.toFixed(2)}
            </span>
          )}
        </span>
        <a
          href={directLink}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--accent)] hover:underline shrink-0"
        >
          open in OSM ↗
        </a>
      </div>
    </div>
  );
}
