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
  const srcDoc = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background: #111;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const DefaultIcon = L.icon({
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41]
    });
    L.Marker.prototype.options.icon = DefaultIcon;

    const lat = ${lat};
    const lng = ${lng};
    const homeLat = ${homeLat ?? "null"};
    const homeLng = ${homeLng ?? "null"};
    const label = ${JSON.stringify(label ?? "Office")};

    const map = L.map('map', {
      zoomControl: true,
      attributionControl: false
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19
    }).addTo(map);

    const officeMarker = L.marker([lat, lng]).addTo(map);
    officeMarker.bindPopup("<b>" + label + "</b>").openPopup();

    const points = [[lat, lng]];

    if (homeLat !== null && homeLng !== null) {
      const homeMarker = L.marker([homeLat, homeLng]).addTo(map);
      homeMarker.bindPopup("<b>Your Home</b>");
      points.push([homeLat, homeLng]);
    }

    if (points.length > 1) {
      map.fitBounds(points, { padding: [45, 45] });
    } else {
      map.setView([lat, lng], 13);
    }
  </script>
</body>
</html>`;

  const directLink = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=12/${lat}/${lng}`;

  return (
    <div className="rounded-md overflow-hidden border border-[var(--border)] bg-[var(--bg-elev)]">
      <iframe
        srcDoc={srcDoc}
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
