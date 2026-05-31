// Right-to-work zone classifier for job listings.
//
// Maps free-text job.location strings (e.g. "London, UK", "San Francisco,
// CA", "Berlin, Germany", "Remote") onto canonical short zone keys so the
// /jobs filter can hide listings outside the user's declared zones.
//
// Design choice: be conservative. If the string doesn't clearly classify,
// return "Unknown" — those rows stay visible in the filtered view because
// false negatives (hiding a job the user could actually take) are worse
// than false positives (one extra row to scroll past).

export const ZONE_KEYS = [
  "US",
  "UK",
  "EU",
  "CA",
  "AU",
  "IN",
  "NZ",
  "MENA",
  "OTHER",
] as const;

export type RightToWorkZone = (typeof ZONE_KEYS)[number] | "Unknown";

interface ZoneLabel {
  key: RightToWorkZone;
  label: string;
  description: string;
}

export const ZONES: ZoneLabel[] = [
  { key: "US", label: "United States", description: "US citizens, GC holders, H1B / TN / OPT" },
  { key: "UK", label: "United Kingdom", description: "British citizens, Settled / Pre-settled, Skilled Worker visa" },
  { key: "EU", label: "European Union / EEA", description: "EU citizens, Blue Card holders, Schengen residence" },
  { key: "CA", label: "Canada", description: "Canadian citizens, PR, work permit" },
  { key: "AU", label: "Australia", description: "Citizens, PR, 482 visa" },
  { key: "IN", label: "India", description: "Citizens, OCI" },
  { key: "NZ", label: "New Zealand", description: "Citizens, PR" },
  { key: "MENA", label: "MENA region", description: "Middle East + North Africa work permits" },
  { key: "OTHER", label: "Other", description: "Use the free-text field below to specify" },
];

const US_STATES = new Set([
  "alabama", "al", "alaska", "ak", "arizona", "az", "arkansas", "ar",
  "california", "ca", "colorado", "co", "connecticut", "ct", "delaware", "de",
  "florida", "fl", "georgia", "ga", "hawaii", "hi", "idaho", "id", "illinois", "il",
  "indiana", "in", "iowa", "ia", "kansas", "ks", "kentucky", "ky", "louisiana", "la",
  "maine", "me", "maryland", "md", "massachusetts", "ma", "michigan", "mi",
  "minnesota", "mn", "mississippi", "ms", "missouri", "mo", "montana", "mt",
  "nebraska", "ne", "nevada", "nv", "new hampshire", "nh", "new jersey", "nj",
  "new mexico", "nm", "new york", "ny", "north carolina", "nc", "north dakota", "nd",
  "ohio", "oh", "oklahoma", "ok", "oregon", "or", "pennsylvania", "pa",
  "rhode island", "ri", "south carolina", "sc", "south dakota", "sd",
  "tennessee", "tn", "texas", "tx", "utah", "ut", "vermont", "vt", "virginia", "va",
  "washington", "wa", "west virginia", "wv", "wisconsin", "wi", "wyoming", "wy",
  "dc", "d.c", "district of columbia",
]);

const EU_COUNTRY_TOKENS = [
  "germany", "deutschland", "berlin", "munich", "münchen", "hamburg", "frankfurt",
  "france", "paris", "lyon", "marseille",
  "spain", "madrid", "barcelona",
  "italy", "rome", "milan", "milano",
  "netherlands", "holland", "amsterdam", "rotterdam", "utrecht", "the hague",
  "belgium", "brussels", "antwerp",
  "poland", "warsaw", "kraków", "krakow",
  "sweden", "stockholm", "gothenburg",
  "denmark", "copenhagen", "aarhus",
  "finland", "helsinki",
  "norway", "oslo",
  "ireland", "dublin", "cork",
  "portugal", "lisbon", "porto",
  "austria", "vienna",
  "czech", "prague",
  "hungary", "budapest",
  "greece", "athens",
  "romania", "bucharest",
  "bulgaria", "sofia",
  "estonia", "tallinn",
  "latvia", "riga",
  "lithuania", "vilnius",
  "slovakia", "bratislava",
  "slovenia", "ljubljana",
  "croatia", "zagreb",
  "luxembourg",
  "malta",
  "cyprus",
  "switzerland", "zurich", "geneva", "bern", // EEA-adjacent — bundled here for practical filtering
  "iceland",
];

const UK_TOKENS = [
  "uk", "united kingdom", "great britain", "britain",
  "england", "scotland", "wales", "northern ireland",
  "london", "manchester", "birmingham", "edinburgh", "glasgow", "leeds",
  "bristol", "liverpool", "cardiff", "belfast", "newcastle", "sheffield",
  "oxford", "cambridge", "brighton", "nottingham",
];

const CA_TOKENS = [
  "canada", "toronto", "vancouver", "montreal", "ottawa", "calgary",
  "edmonton", "winnipeg", "halifax", "quebec",
  "ontario", "british columbia", "alberta", "manitoba", "saskatchewan",
  "nova scotia", "new brunswick",
];

const AU_TOKENS = [
  "australia", "sydney", "melbourne", "brisbane", "perth", "adelaide",
  "canberra", "nsw", "victoria", "queensland",
];

const IN_TOKENS = [
  "india", "bangalore", "bengaluru", "mumbai", "delhi", "new delhi",
  "hyderabad", "chennai", "pune", "kolkata", "gurgaon", "gurugram", "noida",
];

const NZ_TOKENS = [
  "new zealand", "auckland", "wellington", "christchurch",
];

const MENA_TOKENS = [
  "uae", "united arab emirates", "dubai", "abu dhabi",
  "saudi arabia", "riyadh", "jeddah",
  "qatar", "doha",
  "kuwait",
  "bahrain", "manama",
  "oman", "muscat",
  "egypt", "cairo",
  "israel", "tel aviv", "jerusalem",
  "jordan", "amman",
  "morocco", "casablanca",
  "tunisia",
];

/**
 * Classify a free-text location string into a right-to-work zone.
 * Returns "Unknown" for empty / fully remote / unrecognized inputs so the
 * caller can decide to keep them visible.
 */
export function classifyLocationZone(location: string | null | undefined): RightToWorkZone {
  if (!location) return "Unknown";
  const lower = location.toLowerCase();

  // Fully remote with no country hint → Unknown (the user might still be
  // restricted by employer geography, but we can't tell from the string).
  if (/^(\s*remote\s*|\s*anywhere\s*)$/i.test(lower.trim())) return "Unknown";

  // Explicit US tokens. Include bare "US" — common in scraped feeds where
  // the entire location field is just two letters. Require word boundaries
  // so "join us" and "tell us" don't false-positive — and to avoid
  // catching the standalone preposition in normal English the regex only
  // fires inside short location strings that mostly look like place names
  // (no verb context).
  if (/\b(usa|u\.s\.a|united states|u\.s\.)\b/i.test(lower)) return "US";
  // Bare "US" only when it stands alone or is comma-bounded (i.e. it's
  // genuinely the country, not the pronoun).
  if (/(^|,\s*)us(\s*$|,)/i.test(location)) return "US";

  // "City, ST" pattern where ST is a 2-letter state code, OR full state name
  // Note: 2-letter codes like "IN" would clash with India; require a comma
  // before them so we only trigger on "Indianapolis, IN" not "We work in India"
  for (const st of US_STATES) {
    if (st.length === 2) {
      // 2-letter — require ", " before to avoid false positives
      if (new RegExp(`,\\s*${st}\\b`, "i").test(location)) {
        // But careful: "IN" also matches Indiana AND could mean India. Already
        // accounted for: India tokens are checked below; if we reach here it's
        // a comma-prefixed code so it's almost certainly a US state.
        return "US";
      }
    } else {
      if (new RegExp(`\\b${st}\\b`, "i").test(lower)) return "US";
    }
  }

  // UK
  for (const t of UK_TOKENS) {
    if (new RegExp(`\\b${t}\\b`, "i").test(lower)) return "UK";
  }

  // EU
  for (const t of EU_COUNTRY_TOKENS) {
    if (new RegExp(`\\b${t}\\b`, "i").test(lower)) return "EU";
  }

  // Canada
  for (const t of CA_TOKENS) {
    if (new RegExp(`\\b${t}\\b`, "i").test(lower)) return "CA";
  }

  // Australia
  for (const t of AU_TOKENS) {
    if (new RegExp(`\\b${t}\\b`, "i").test(lower)) return "AU";
  }

  // India
  for (const t of IN_TOKENS) {
    if (new RegExp(`\\b${t}\\b`, "i").test(lower)) return "IN";
  }

  // NZ
  for (const t of NZ_TOKENS) {
    if (new RegExp(`\\b${t}\\b`, "i").test(lower)) return "NZ";
  }

  // MENA
  for (const t of MENA_TOKENS) {
    if (new RegExp(`\\b${t}\\b`, "i").test(lower)) return "MENA";
  }

  return "Unknown";
}

/**
 * True when a job's location is acceptable given the user's declared zones.
 * Always returns true when the user has no declared zones (filter inactive),
 * or when the classifier returns "Unknown" (don't hide ambiguous rows).
 */
export function jobLocationMatchesRightToWork(
  jobLocation: string | null | undefined,
  declaredZones: string[],
): boolean {
  if (declaredZones.length === 0) return true; // no declaration → no filter
  const z = classifyLocationZone(jobLocation);
  if (z === "Unknown") return true; // keep ambiguous rows visible
  return declaredZones.includes(z);
}
