// Glassdoor company-review enrichment via Apify.
//
// Reads APIFY_API_TOKEN + APIFY_GLASSDOOR_ACTOR_ID from env. If either is
// missing, returns null so the caller can gracefully skip. Most Glassdoor
// scraper actors on Apify accept a `companies` array (names or URLs) or a
// `companyUrls` field — we send the union and rely on the actor to ignore
// extras.

const APIFY_BASE = "https://api.apify.com/v2";
const POLL_INTERVAL_MS = 3_000;
const MAX_POLL_MS = 90_000;

export interface GlassdoorEnrichment {
  rating: number | null; // 1.0–5.0
  reviewCount: number | null;
  recommendPct: number | null; // 0–100 ("Would recommend to a friend")
  ceoApprovalPct: number | null; // 0–100
  proSummary: string | null; // single-sentence top pro from reviews
  conSummary: string | null; // single-sentence top con from reviews
  url: string | null;
  raw: Record<string, unknown>;
}

interface RunData {
  id: string;
  actId: string;
  status:
    | "READY"
    | "RUNNING"
    | "SUCCEEDED"
    | "FAILED"
    | "TIMING-OUT"
    | "TIMED-OUT"
    | "ABORTING"
    | "ABORTED";
  defaultDatasetId: string;
  finishedAt?: string;
}

interface RunResponse {
  data: RunData;
}

async function startRun(
  actorId: string,
  token: string,
  input: Record<string, unknown>,
): Promise<RunData> {
  const url = `${APIFY_BASE}/acts/${encodeURIComponent(actorId)}/runs?token=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Apify start (${res.status}): ${text || res.statusText}`);
  }
  return ((await res.json()) as RunResponse).data;
}

async function pollUntilFinished(runId: string, token: string): Promise<RunData> {
  const deadline = Date.now() + MAX_POLL_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const url = `${APIFY_BASE}/actor-runs/${encodeURIComponent(runId)}?token=${encodeURIComponent(token)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Apify poll (${res.status}): ${text || res.statusText}`);
    }
    const data = ((await res.json()) as RunResponse).data;
    if (
      data.status === "SUCCEEDED" ||
      data.status === "FAILED" ||
      data.status === "TIMED-OUT" ||
      data.status === "ABORTED"
    ) {
      return data;
    }
  }
  throw new Error(`Apify run did not finish within ${MAX_POLL_MS}ms`);
}

async function fetchDatasetItem(datasetId: string, token: string): Promise<unknown | null> {
  // We only need the first row — Glassdoor company-overview actors typically
  // emit one row per company input.
  const url = `${APIFY_BASE}/datasets/${encodeURIComponent(datasetId)}/items?token=${encodeURIComponent(token)}&format=json&limit=1`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Apify dataset (${res.status}): ${text || res.statusText}`);
  }
  const items = (await res.json()) as unknown;
  return Array.isArray(items) && items.length > 0 ? items[0] : null;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v.slice(0, 500) : null;
}

function parseRow(row: unknown): GlassdoorEnrichment {
  const r = (row ?? {}) as Record<string, unknown>;
  // Try every reasonable field-name variant — Glassdoor actors disagree.
  const rating =
    num(r.overallRating) ??
    num(r.rating) ??
    num((r.reviewSummary as Record<string, unknown> | undefined)?.rating) ??
    null;

  const reviewCount =
    num(r.reviewCount) ??
    num(r.numberOfReviews) ??
    num(r.reviewsCount) ??
    num((r.reviewSummary as Record<string, unknown> | undefined)?.reviewCount) ??
    null;

  const recommendPct =
    num(r.recommendToFriendPct) ??
    num(r.recommendToFriendRating) ??
    num(r.wouldRecommendPct) ??
    null;

  const ceoApprovalPct =
    num(r.ceoApprovalRating) ?? num(r.ceoApprovalPct) ?? num(r.ceoApproval) ?? null;

  const proSummary =
    str(r.topProSummary) ??
    str(r.topPro) ??
    str(r.bestPro) ??
    str((r.pros as Array<unknown> | undefined)?.[0]) ??
    null;

  const conSummary =
    str(r.topConSummary) ??
    str(r.topCon) ??
    str(r.worstCon) ??
    str((r.cons as Array<unknown> | undefined)?.[0]) ??
    null;

  const url = str(r.companyUrl) ?? str(r.url) ?? str(r.glassdoorUrl) ?? null;

  return {
    rating: rating !== null && rating >= 0 && rating <= 5 ? rating : null,
    reviewCount,
    recommendPct:
      recommendPct !== null && recommendPct >= 0 && recommendPct <= 100 ? recommendPct : null,
    ceoApprovalPct:
      ceoApprovalPct !== null && ceoApprovalPct >= 0 && ceoApprovalPct <= 100
        ? ceoApprovalPct
        : null,
    proSummary,
    conSummary,
    url,
    raw: r,
  };
}

export interface GlassdoorLookupOptions {
  /** Optional explicit Glassdoor URL ("https://www.glassdoor.com/Overview/Working-at-Stripe-EI_IE671932.htm") */
  glassdoorUrl?: string | null;
}

/**
 * Look up a company on Glassdoor via the configured Apify actor. Returns null
 * (not an error) if either env var is missing — letting the orchestrator skip
 * gracefully.
 */
export async function lookupCompanyOnGlassdoor(
  companyName: string,
  opts: GlassdoorLookupOptions = {},
): Promise<GlassdoorEnrichment | null> {
  const token = process.env.APIFY_API_TOKEN;
  const actorId = process.env.APIFY_GLASSDOOR_ACTOR_ID;
  if (!token || !actorId) return null;
  if (!companyName.trim()) return null;

  // Multi-shape input — different Glassdoor actors take different keys.
  // The union is small enough to send to all of them.
  const input: Record<string, unknown> = {
    companies: [companyName.trim()],
    companyNames: [companyName.trim()],
    companyName: companyName.trim(),
    keywords: [companyName.trim()],
    maxItems: 1,
    maxResults: 1,
  };
  if (opts.glassdoorUrl) {
    input.companyUrls = [opts.glassdoorUrl];
    input.startUrls = [{ url: opts.glassdoorUrl }];
    input.urls = [opts.glassdoorUrl];
  }

  const run = await startRun(actorId, token, input);
  const finished = await pollUntilFinished(run.id, token);
  if (finished.status !== "SUCCEEDED") {
    throw new Error(`Glassdoor actor run finished with status ${finished.status}`);
  }
  const item = await fetchDatasetItem(finished.defaultDatasetId, token);
  return parseRow(item);
}
