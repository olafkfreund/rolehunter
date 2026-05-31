// Bulk description backfill for ingested jobs that arrived without a body.
//
// Why this exists: feed-style sources (LinkedIn search API, JobSpy/LinkedIn,
// some Apify actors) return the listing card only — title, company,
// location, URL — and never the full description on the search response.
// Originally we deferred the second call ("fetch detail on /jobs/[id] view")
// but jobs the user hasn't opened stay description-less, and the scoring
// pipeline degrades silently (Skills classifier sees empty text → 0 tokens
// → n/a Skills dimension).
//
// Resolution strategy per row:
//   1. Try the upstream LinkedIn RapidAPI /job-detail endpoint (404 on
//      many RapidAPI hosts — they only expose search, not detail).
//   2. Fall back to fetching the public linkedin.com/jobs/view/{id} page
//      and scraping the description block. LinkedIn bot-protects this;
//      success is intermittent.
//
// Best-effort: per-row failures don't abort the batch. The UI shows the
// failed count so the user knows what's stuck.
//
// Forward fix: setting JOBSPY_LINKEDIN_FETCH_DESCRIPTION=1 in env makes
// JobSpy fetch descriptions on initial ingest (slower per row but no
// backfill needed afterward).

import { eq, isNull, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getJobDetail } from "@/lib/linkedin/client";
import { updateJobDescription } from "@/lib/repo/jobs";

export interface BackfillResult {
  scanned: number;
  filled: number;
  failed: number;
  skipped: number;
  remaining: number;
}

const POLITE_DELAY_MS = 600;

function linkedinIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  // Two formats coexist:
  //   .../jobs/view/4397059864
  //   .../jobs/view/sre-manager-ecommerce-at-oliver-bernard-4417638618
  // The numeric id (8-12 digits) is always there — sometimes immediately
  // after /view/, sometimes at the very end of a slug.
  const slug = url.match(/linkedin\.com\/jobs\/view\/[^?#]*?(\d{8,12})(?:[?#/]|$)/i);
  return slug?.[1] ?? null;
}

async function scrapeLinkedInJobPage(externalId: string): Promise<string | null> {
  try {
    const url = `https://www.linkedin.com/jobs/view/${encodeURIComponent(externalId)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; RoleHunterBot/3.2; +https://github.com/olafkfreund/rolehunter)",
        Accept: "text/html",
      },
      cache: "no-store",
      redirect: "follow",
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("text/html")) return null;
    const html = await res.text();
    if (html.length < 200 || html.length > 4_000_000) return null;
    // Target the innermost content wrapper — LinkedIn nests divs:
    //   <div class="description__text">
    //     <section class="show-more-less-html">
    //       <div class="show-more-less-html__markup">  ← actual content
    //   ...
    // and a trailing "show more" button closes it. Matching until the
    // button keeps us from grabbing surrounding chrome.
    const m =
      html.match(
        /<div[^>]+class="[^"]*show-more-less-html__markup[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<button/i,
      ) ||
      html.match(
        /<section[^>]+class="[^"]*show-more-less-html[^"]*"[^>]*>([\s\S]*?)<\/section>/i,
      );
    if (!m) return null;
    const text = m[1]
      .replace(/<\s*br\s*\/?>/gi, "\n")
      .replace(/<\/(p|li|div|h[1-6])\s*>/gi, "\n\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return text.length > 50 ? text.slice(0, 30_000) : null;
  } catch {
    return null;
  }
}

/**
 * Backfill description for up to `limit` empty-description jobs. Capped so
 * the API route stays under the timeout and the upstream isn't hammered.
 * Re-callable until `remaining` is 0.
 */
export async function backfillEmptyDescriptions(
  opts: { limit?: number } = {},
): Promise<BackfillResult> {
  const limit = Math.min(opts.limit ?? 25, 100);
  const db = getDb();

  const empties = await db
    .select({
      id: schema.jobListings.id,
      source: schema.jobListings.source,
      externalId: schema.jobListings.externalId,
      url: schema.jobListings.url,
      rawJson: schema.jobListings.rawJson,
    })
    .from(schema.jobListings)
    .where(
      or(
        isNull(schema.jobListings.description),
        sql`length(trim(${schema.jobListings.description})) = 0`,
      ),
    )
    .limit(limit);

  let filled = 0;
  let failed = 0;
  let skipped = 0;
  for (const row of empties) {
    // Resolve the LinkedIn job-view id from the URL — the RapidAPI source
    // stores an internal id on externalId that's NOT a public LinkedIn
    // job id, so we always extract from URL when present. jobspy rows
    // keep the LinkedIn URL on rawJson.raw.jobUrl.
    let externalId: string | null = null;
    if (row.source === "jobspy") {
      const raw = row.rawJson as { raw?: { jobUrl?: string } } | null;
      externalId =
        linkedinIdFromUrl(raw?.raw?.jobUrl ?? null) ?? linkedinIdFromUrl(row.url);
    } else {
      externalId = linkedinIdFromUrl(row.url);
      // Last resort: externalId itself if it looks like a LinkedIn id.
      if (!externalId && row.externalId && /^\d{8,12}$/.test(row.externalId)) {
        externalId = row.externalId;
      }
    }
    if (!externalId) {
      skipped++;
      continue;
    }

    // Tier 1: dedicated RapidAPI detail endpoint (may 404 on this host).
    let description: string | null = null;
    try {
      const detail = await getJobDetail(externalId);
      if (detail.description && detail.description.trim().length > 0) {
        description = detail.description;
      }
    } catch {
      // 404 / 401 / etc. — fall through to the public-page tier.
    }

    // Tier 2: public linkedin.com/jobs/view/{id} page scrape.
    if (!description) {
      description = await scrapeLinkedInJobPage(externalId);
    }

    if (description) {
      try {
        await updateJobDescription(row.id, description);
        filled++;
      } catch {
        failed++;
      }
    } else {
      failed++;
    }
    // Polite delay so we don't burst against the upstream rate-limit.
    await new Promise((r) => setTimeout(r, POLITE_DELAY_MS));
  }

  // How many empty rows remain (for the UI to show "X remaining").
  const remainingRows = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(schema.jobListings)
    .where(
      or(
        isNull(schema.jobListings.description),
        sql`length(trim(${schema.jobListings.description})) = 0`,
      ),
    );
  const remaining = Number(remainingRows[0]?.count ?? 0);

  return {
    scanned: empties.length,
    filled,
    failed,
    skipped,
    remaining,
  };
}

/**
 * Mark a single job's description as filled (for use from the page-view
 * lazy-fetch path). Just a thin re-export so the API route can stay flat.
 */
export async function fillDescriptionFor(
  jobId: number,
  description: string,
): Promise<void> {
  await updateJobDescription(jobId, description);
}

/** Diagnostic: how many empty-description rows exist, by source? */
export async function countEmptyDescriptionsBySource(): Promise<
  Record<string, number>
> {
  const db = getDb();
  const rows = await db
    .select({
      source: schema.jobListings.source,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(schema.jobListings)
    .where(
      or(
        isNull(schema.jobListings.description),
        sql`length(trim(${schema.jobListings.description})) = 0`,
      ),
    )
    .groupBy(schema.jobListings.source);

  const out: Record<string, number> = {};
  for (const r of rows) out[r.source as string] = Number(r.count);
  return out;
}

void eq; // keep drizzle import for future selective queries
