// Repo helpers for the 6 sibling tables introduced in #43 final-stretch.
// All operations are CASCADE-safe because the FKs are ON DELETE CASCADE on
// the companies row.

import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type {
  CompanyBenefit,
  CompanyConnection,
  CompanyLayoff,
  CompanyNewsItem,
  CompanyOffice,
  CompanyReview,
} from "@/lib/db/schema";

// ── Offices ─────────────────────────────────────────────────────────────

export interface NewOffice {
  label?: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  amenities?: string[];
}

export async function upsertOffice(
  companyId: number,
  office: NewOffice,
): Promise<CompanyOffice> {
  const db = getDb();
  // We dedupe on (company_id, address); if no address present we always insert
  // a new row so the user can record multiple unnamed offices.
  if (office.address) {
    const existing = await db
      .select()
      .from(schema.companyOffices)
      .where(eq(schema.companyOffices.companyId, companyId))
      .limit(50);
    const match = existing.find((o) => o.address === office.address);
    if (match) {
      const [row] = await db
        .update(schema.companyOffices)
        .set({
          label: office.label ?? match.label,
          lat: office.lat ?? match.lat,
          lng: office.lng ?? match.lng,
          amenities: office.amenities ?? (match.amenities as never),
        })
        .where(eq(schema.companyOffices.id, match.id))
        .returning();
      return row;
    }
  }
  const [row] = await db
    .insert(schema.companyOffices)
    .values({
      companyId,
      label: office.label ?? "",
      address: office.address ?? null,
      lat: office.lat ?? null,
      lng: office.lng ?? null,
      amenities: office.amenities ?? [],
    })
    .returning();
  return row;
}

export async function listOffices(companyId: number): Promise<CompanyOffice[]> {
  const db = getDb();
  return db
    .select()
    .from(schema.companyOffices)
    .where(eq(schema.companyOffices.companyId, companyId))
    .orderBy(desc(schema.companyOffices.createdAt));
}

// ── Reviews ─────────────────────────────────────────────────────────────

export interface NewReview {
  source: "glassdoor" | "blind" | "fishbowl" | "other";
  title?: string | null;
  body?: string;
  rating?: number | null;
  pros?: string | null;
  cons?: string | null;
  role?: string | null;
  postedAt?: string | Date | null;
  rawJson?: Record<string, unknown>;
}

export async function insertReview(
  companyId: number,
  r: NewReview,
): Promise<CompanyReview> {
  const db = getDb();
  const [row] = await db
    .insert(schema.companyReviews)
    .values({
      companyId,
      source: r.source,
      title: r.title ?? null,
      body: r.body ?? "",
      rating: r.rating !== null && r.rating !== undefined ? String(r.rating) : null,
      pros: r.pros ?? null,
      cons: r.cons ?? null,
      role: r.role ?? null,
      postedAt: r.postedAt ? new Date(r.postedAt) : null,
      rawJson: r.rawJson ?? null,
    })
    .returning();
  return row;
}

export async function listReviews(
  companyId: number,
  opts: { limit?: number } = {},
): Promise<CompanyReview[]> {
  const db = getDb();
  return db
    .select()
    .from(schema.companyReviews)
    .where(eq(schema.companyReviews.companyId, companyId))
    .orderBy(desc(schema.companyReviews.fetchedAt))
    .limit(opts.limit ?? 20);
}

// ── Benefits ────────────────────────────────────────────────────────────

export interface NewBenefit {
  category: string; // "401k"|"pto"|"parental"|"health"|"equity"|"stipend"|"other"
  description: string;
  valueText?: string | null;
  source?: string | null;
  rawJson?: Record<string, unknown>;
}

export async function upsertBenefit(
  companyId: number,
  b: NewBenefit,
): Promise<CompanyBenefit> {
  const db = getDb();
  // Dedup on (company_id, category, description) so the same scraper rerun
  // doesn't duplicate.
  const existing = await db
    .select()
    .from(schema.companyBenefits)
    .where(eq(schema.companyBenefits.companyId, companyId))
    .limit(200);
  const match = existing.find(
    (e) => e.category === b.category && e.description === b.description,
  );
  if (match) {
    const [row] = await db
      .update(schema.companyBenefits)
      .set({
        valueText: b.valueText ?? match.valueText,
        source: b.source ?? match.source,
        rawJson: (b.rawJson ?? match.rawJson) as never,
      })
      .where(eq(schema.companyBenefits.id, match.id))
      .returning();
    return row;
  }
  const [row] = await db
    .insert(schema.companyBenefits)
    .values({
      companyId,
      category: b.category,
      description: b.description,
      valueText: b.valueText ?? null,
      source: b.source ?? null,
      rawJson: b.rawJson ?? null,
    })
    .returning();
  return row;
}

export async function listBenefits(companyId: number): Promise<CompanyBenefit[]> {
  const db = getDb();
  return db
    .select()
    .from(schema.companyBenefits)
    .where(eq(schema.companyBenefits.companyId, companyId))
    .orderBy(schema.companyBenefits.category);
}

// ── News ────────────────────────────────────────────────────────────────

export interface NewNewsItem {
  kind?:
    | "news"
    | "funding"
    | "acquisition"
    | "ipo"
    | "leadership"
    | "press_release";
  title: string;
  summary?: string;
  url?: string | null;
  source?: string | null;
  publishedAt?: string | Date | null;
  rawJson?: Record<string, unknown>;
}

export async function upsertNewsItem(
  companyId: number,
  n: NewNewsItem,
): Promise<CompanyNewsItem> {
  const db = getDb();
  // Dedup on URL when present.
  if (n.url) {
    const existing = await db
      .select()
      .from(schema.companyNews)
      .where(eq(schema.companyNews.companyId, companyId))
      .limit(200);
    const match = existing.find((e) => e.url === n.url);
    if (match) {
      const [row] = await db
        .update(schema.companyNews)
        .set({
          title: n.title,
          summary: n.summary ?? match.summary,
          kind: n.kind ?? match.kind,
          publishedAt: n.publishedAt ? new Date(n.publishedAt) : match.publishedAt,
        })
        .where(eq(schema.companyNews.id, match.id))
        .returning();
      return row;
    }
  }
  const [row] = await db
    .insert(schema.companyNews)
    .values({
      companyId,
      kind: n.kind ?? "news",
      title: n.title,
      summary: n.summary ?? "",
      url: n.url ?? null,
      source: n.source ?? null,
      publishedAt: n.publishedAt ? new Date(n.publishedAt) : null,
      rawJson: n.rawJson ?? null,
    })
    .returning();
  return row;
}

export async function listNews(
  companyId: number,
  opts: { limit?: number } = {},
): Promise<CompanyNewsItem[]> {
  const db = getDb();
  return db
    .select()
    .from(schema.companyNews)
    .where(eq(schema.companyNews.companyId, companyId))
    .orderBy(desc(schema.companyNews.publishedAt), desc(schema.companyNews.fetchedAt))
    .limit(opts.limit ?? 20);
}

// ── Layoffs ─────────────────────────────────────────────────────────────

export interface NewLayoff {
  affectedCount?: number | null;
  percentOfWorkforce?: number | null;
  announcedAt: string | Date;
  sourceUrl?: string | null;
  summary?: string;
  rawJson?: Record<string, unknown>;
}

export async function upsertLayoff(
  companyId: number,
  l: NewLayoff,
): Promise<CompanyLayoff> {
  const db = getDb();
  const date = new Date(l.announcedAt);
  // Dedup on (company_id, announced_at, affected_count)
  const existing = await db
    .select()
    .from(schema.companyLayoffs)
    .where(eq(schema.companyLayoffs.companyId, companyId))
    .limit(200);
  const match = existing.find(
    (e) =>
      e.announcedAt &&
      new Date(e.announcedAt).getTime() === date.getTime() &&
      e.affectedCount === (l.affectedCount ?? null),
  );
  if (match) return match;
  const [row] = await db
    .insert(schema.companyLayoffs)
    .values({
      companyId,
      affectedCount: l.affectedCount ?? null,
      percentOfWorkforce:
        l.percentOfWorkforce !== null && l.percentOfWorkforce !== undefined
          ? String(l.percentOfWorkforce)
          : null,
      announcedAt: date,
      sourceUrl: l.sourceUrl ?? null,
      summary: l.summary ?? "",
      rawJson: l.rawJson ?? null,
    })
    .returning();
  return row;
}

export async function listLayoffs(companyId: number): Promise<CompanyLayoff[]> {
  const db = getDb();
  return db
    .select()
    .from(schema.companyLayoffs)
    .where(eq(schema.companyLayoffs.companyId, companyId))
    .orderBy(desc(schema.companyLayoffs.announcedAt));
}

// ── Connections ─────────────────────────────────────────────────────────

export interface NewConnection {
  kind: "current_employee" | "alumni" | "school_alumni" | "mutual_connection";
  name?: string;
  headline?: string | null;
  linkedinUrl?: string | null;
  sharedSchool?: string | null;
  rawJson?: Record<string, unknown>;
}

export async function upsertConnection(
  companyId: number,
  c: NewConnection,
): Promise<CompanyConnection> {
  const db = getDb();
  if (c.linkedinUrl) {
    const existing = await db
      .select()
      .from(schema.companyConnections)
      .where(eq(schema.companyConnections.companyId, companyId))
      .limit(500);
    const match = existing.find((e) => e.linkedinUrl === c.linkedinUrl);
    if (match) return match;
  }
  const [row] = await db
    .insert(schema.companyConnections)
    .values({
      companyId,
      kind: c.kind,
      name: c.name ?? "",
      headline: c.headline ?? null,
      linkedinUrl: c.linkedinUrl ?? null,
      sharedSchool: c.sharedSchool ?? null,
      rawJson: c.rawJson ?? null,
    })
    .returning();
  return row;
}

export async function listConnections(
  companyId: number,
): Promise<CompanyConnection[]> {
  const db = getDb();
  return db
    .select()
    .from(schema.companyConnections)
    .where(eq(schema.companyConnections.companyId, companyId))
    .orderBy(schema.companyConnections.kind);
}
