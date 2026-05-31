// Wikidata company enricher — free, no API key, generous rate limits.
// Returns description + headquarters + founded year + official website.
//
// Two-stage call:
//   1) wbsearchentities to resolve a name to a Q-id
//   2) wbgetentities to fetch the structured claims
//
// We match on the first result whose instance-of (P31) is "company" /
// "business" / "corporation" / "organization" — avoids returning a band
// or product when the company is small.

const COMPANY_INSTANCE_QIDS = new Set([
  "Q4830453", // business
  "Q783794", // company
  "Q6881511", // enterprise
  "Q43229", // organization
  "Q891723", // public company
  "Q1786505", // limited company
  "Q156954", // corporation
  "Q4671277", // academic institution (sometimes employers)
]);

export interface WikidataCompanyMatch {
  qid: string;
  name: string;
  description: string;
  website: string | null;
  headquarters: string | null;
  foundedYear: number | null;
  matchKind: "exact" | "fuzzy";
}

interface WbSearchHit {
  id: string;
  label: string;
  description?: string;
  match?: { type: string; text: string };
}

interface WbSearchResponse {
  search: WbSearchHit[];
}

interface WbEntityClaim {
  mainsnak?: {
    datavalue?: {
      value:
        | string
        | { id?: string; time?: string; "entity-type"?: string; "numeric-id"?: number; text?: string; language?: string };
    };
  };
}

interface WbEntity {
  id: string;
  labels?: Record<string, { value: string }>;
  descriptions?: Record<string, { value: string }>;
  claims?: Record<string, WbEntityClaim[]>;
}

interface WbGetEntitiesResponse {
  entities?: Record<string, WbEntity>;
}

async function wbFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent":
        "rolehunter/3.2 (+https://github.com/olafkfreund/rolehunter; olaf@freundcloud.com)",
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Wikidata ${res.status}: ${res.statusText}`);
  return (await res.json()) as T;
}

function valueOf(claim: WbEntityClaim | undefined): unknown {
  return claim?.mainsnak?.datavalue?.value;
}

function entityIdOf(claim: WbEntityClaim | undefined): string | null {
  const v = valueOf(claim);
  if (v && typeof v === "object" && "id" in v && typeof v.id === "string") return v.id;
  return null;
}

function stringOf(claim: WbEntityClaim | undefined): string | null {
  const v = valueOf(claim);
  if (typeof v === "string") return v;
  return null;
}

function isCompanyEntity(entity: WbEntity): boolean {
  const p31 = entity.claims?.P31; // instance of
  if (!p31) return false;
  for (const c of p31) {
    const qid = entityIdOf(c);
    if (qid && COMPANY_INSTANCE_QIDS.has(qid)) return true;
  }
  return false;
}

function yearFromTimeValue(v: unknown): number | null {
  if (!v || typeof v !== "object" || !("time" in v) || typeof v.time !== "string") return null;
  // Format: +1990-01-01T00:00:00Z or -0044-... for BCE
  const m = v.time.match(/^[+-](\d{4})-/);
  if (!m) return null;
  const y = Number(m[1]);
  return Number.isFinite(y) ? y : null;
}

async function fetchHeadquartersLabel(qid: string): Promise<string | null> {
  try {
    const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(qid)}&props=labels&languages=en&format=json`;
    const data = await wbFetch<WbGetEntitiesResponse>(url);
    return data.entities?.[qid]?.labels?.en?.value ?? null;
  } catch {
    return null;
  }
}

export async function lookupCompanyOnWikidata(
  name: string,
): Promise<WikidataCompanyMatch | null> {
  if (!name || !name.trim()) return null;
  const q = name.trim();

  const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(q)}&language=en&format=json&limit=10&type=item`;
  const search = await wbFetch<WbSearchResponse>(searchUrl);
  if (!search.search?.length) return null;

  // Fetch top-5 entities and pick the first that is a company by P31.
  const ids = search.search.slice(0, 5).map((h) => h.id);
  const idsParam = ids.join("|");
  const entitiesUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(idsParam)}&props=labels|descriptions|claims&languages=en&format=json`;
  const entitiesRes = await wbFetch<WbGetEntitiesResponse>(entitiesUrl);

  let pick: WbEntity | null = null;
  for (const id of ids) {
    const e = entitiesRes.entities?.[id];
    if (!e) continue;
    if (isCompanyEntity(e)) {
      pick = e;
      break;
    }
  }

  // Fallback: top hit even if instance-of doesn't say "company".
  if (!pick) {
    const e = entitiesRes.entities?.[ids[0]];
    if (!e) return null;
    pick = e;
  }

  const label = pick.labels?.en?.value ?? q;
  const matchKind: "exact" | "fuzzy" = label.toLowerCase() === q.toLowerCase() ? "exact" : "fuzzy";
  const description = pick.descriptions?.en?.value ?? "";

  // Website (P856), Headquarters (P159), Founded (P571)
  const website = stringOf(pick.claims?.P856?.[0]);
  const hqQid = entityIdOf(pick.claims?.P159?.[0]);
  const foundedYear = pick.claims?.P571 ? yearFromTimeValue(valueOf(pick.claims.P571[0])) : null;

  const headquarters = hqQid ? await fetchHeadquartersLabel(hqQid) : null;

  return {
    qid: pick.id,
    name: label,
    description,
    website,
    headquarters,
    foundedYear,
    matchKind,
  };
}
