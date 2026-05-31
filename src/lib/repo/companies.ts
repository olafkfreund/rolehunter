import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { Company } from "@/lib/db/schema";
import { enrichCompanyByName } from "@/lib/companies/enrich";

const FRESH_MS = 7 * 24 * 60 * 60 * 1000; // a company snapshot is "fresh" for 7 days

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 200);
}

export async function getOrCreateCompanyByName(name: string): Promise<Company | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const slug = slugify(trimmed);
  if (!slug) return null;

  const db = getDb();
  const existing = await db
    .select()
    .from(schema.companies)
    .where(eq(schema.companies.slug, slug))
    .limit(1);
  if (existing.length > 0) return existing[0];

  const [row] = await db
    .insert(schema.companies)
    .values({
      name: trimmed,
      slug,
    })
    .returning();
  return row;
}

export async function getCompanyById(id: number): Promise<Company | null> {
  const db = getDb();
  const rows = await db.select().from(schema.companies).where(eq(schema.companies.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getCompanyForJob(jobId: number): Promise<Company | null> {
  const db = getDb();
  const rows = await db
    .select({ c: schema.companies })
    .from(schema.jobListings)
    .innerJoin(schema.companies, eq(schema.companies.id, schema.jobListings.companyId))
    .where(eq(schema.jobListings.id, jobId))
    .limit(1);
  return rows[0]?.c ?? null;
}

export function isFresh(c: Company): boolean {
  if (!c.enrichmentSyncedAt) return false;
  return Date.now() - new Date(c.enrichmentSyncedAt).getTime() < FRESH_MS;
}

/**
 * Enrich (or refresh) a company and persist the result. Also backfills
 * job_listings.company_id for any matching listings if jobId is provided.
 */
export async function enrichAndPersist(
  companyId: number,
  opts: { jobIdToBackfill?: number; force?: boolean } = {},
): Promise<Company> {
  const db = getDb();
  const company = await getCompanyById(companyId);
  if (!company) throw new Error(`Company ${companyId} not found`);

  if (!opts.force && isFresh(company)) {
    return company;
  }

  const payload = await enrichCompanyByName(company.name);

  const hqCoordsResolved = payload.hqLat != null && payload.hqLng != null;
  const [updated] = await db
    .update(schema.companies)
    .set({
      website: payload.website,
      headquarters: payload.headquarters,
      hqLat: payload.hqLat,
      hqLng: payload.hqLng,
      hqGeocodedAt: hqCoordsResolved ? new Date() : null,
      foundedYear: payload.foundedYear,
      summary: payload.summary,
      logoUrl: payload.logoUrl,
      wikidataId: payload.wikidataId,
      linkedinUrl: payload.linkedinUrl,
      glassdoorUrl: payload.glassdoorUrl,
      glassdoorRating:
        payload.glassdoorRating !== null ? String(payload.glassdoorRating) : null,
      glassdoorReviewCount: payload.glassdoorReviewCount,
      glassdoorRecommendPct: payload.glassdoorRecommendPct,
      glassdoorCeoApprovalPct: payload.glassdoorCeoApprovalPct,
      glassdoorTopPro: payload.glassdoorTopPro,
      glassdoorTopCon: payload.glassdoorTopCon,
      glassdoorSyncedAt: payload.glassdoorAttempted ? new Date() : null,
      hasRecentLayoff: payload.hasRecentLayoff,
      lastLayoffAt: payload.lastLayoffAt ? new Date(payload.lastLayoffAt) : null,
      lastLayoffCount: payload.lastLayoffCount,
      enrichmentSyncedAt: new Date(),
      rawJson: payload.raw as Record<string, unknown>,
      updatedAt: sql`NOW()` as unknown as Date,
    })
    .where(eq(schema.companies.id, companyId))
    .returning();

  if (opts.jobIdToBackfill) {
    await db
      .update(schema.jobListings)
      .set({ companyId: updated.id })
      .where(eq(schema.jobListings.id, opts.jobIdToBackfill));
  }

  return updated;
}

/**
 * High-level: given a job listing, ensure its companyId is set and the
 * company is enriched. Returns the (possibly newly enriched) company.
 *
 * Pass `force: true` to re-enrich even if the existing row is within the
 * 7-day cache window (used by the Refresh button).
 */
export async function ensureCompanyForJob(
  jobId: number,
  opts: { force?: boolean } = {},
): Promise<Company | null> {
  const db = getDb();
  const jobRows = await db
    .select({
      id: schema.jobListings.id,
      company: schema.jobListings.company,
      companyId: schema.jobListings.companyId,
    })
    .from(schema.jobListings)
    .where(eq(schema.jobListings.id, jobId))
    .limit(1);
  const job = jobRows[0];
  if (!job) return null;
  if (!job.company || !job.company.trim()) return null;

  let companyRecord: Company | null = null;
  if (job.companyId) {
    companyRecord = await getCompanyById(job.companyId);
  }
  if (!companyRecord) {
    companyRecord = await getOrCreateCompanyByName(job.company);
    if (!companyRecord) return null;
    await db
      .update(schema.jobListings)
      .set({ companyId: companyRecord.id })
      .where(eq(schema.jobListings.id, jobId));
  }

  return enrichAndPersist(companyRecord.id, { force: opts.force });
}
