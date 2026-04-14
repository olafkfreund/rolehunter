import { and, desc, eq, ilike, sql } from "drizzle-orm";
import crypto from "node:crypto";
import { getDb, schema } from "@/lib/db";
import type { JobListing } from "@/lib/db/schema";
import type { JSearchJob } from "@/lib/jsearch/client";
import type { LinkedInJob } from "@/lib/linkedin/client";

export async function listJobs(): Promise<JobListing[]> {
  const db = getDb();
  return db
    .select()
    .from(schema.jobListings)
    .orderBy(desc(schema.jobListings.cachedAt));
}

export async function getJob(id: number): Promise<JobListing | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.jobListings)
    .where(eq(schema.jobListings.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function deleteJob(id: number): Promise<void> {
  const db = getDb();
  await db.delete(schema.jobListings).where(eq(schema.jobListings.id, id));
}

export async function insertPasted(params: {
  title: string;
  company?: string;
  location?: string;
  description: string;
  url?: string;
}): Promise<JobListing> {
  const db = getDb();
  const externalId = `paste-${crypto.randomUUID()}`;
  const rows = await db
    .insert(schema.jobListings)
    .values({
      source: "paste",
      externalId,
      title: params.title,
      company: params.company ?? "",
      location: params.location ?? "",
      url: params.url ?? null,
      description: params.description,
      rawJson: null,
    })
    .returning();
  return rows[0];
}

function formatJSearchLocation(j: JSearchJob): string {
  const parts = [j.job_city, j.job_country].filter(
    (s): s is string => typeof s === "string" && s.length > 0,
  );
  return parts.join(", ");
}

export async function upsertFromJSearch(j: JSearchJob): Promise<JobListing> {
  const db = getDb();
  const postedAt = j.job_posted_at_datetime_utc
    ? new Date(j.job_posted_at_datetime_utc)
    : null;

  const values = {
    source: "jsearch" as const,
    externalId: j.job_id,
    title: j.job_title ?? "Untitled role",
    company: j.employer_name ?? "",
    location: formatJSearchLocation(j),
    url: j.job_apply_link ?? null,
    description: j.job_description ?? "",
    postedAt,
    salaryMin: j.job_min_salary ?? null,
    salaryMax: j.job_max_salary ?? null,
    salaryCurrency: j.job_salary_currency ?? null,
    rawJson: j as unknown as Record<string, unknown>,
    cachedAt: new Date(),
  };

  const rows = await db
    .insert(schema.jobListings)
    .values(values)
    .onConflictDoUpdate({
      target: [schema.jobListings.source, schema.jobListings.externalId],
      set: {
        description: values.description,
        cachedAt: values.cachedAt,
      },
    })
    .returning();
  return rows[0];
}

export async function searchCachedJobs(query: string): Promise<JobListing[]> {
  const db = getDb();
  const q = `%${query}%`;
  return db
    .select()
    .from(schema.jobListings)
    .where(and(eq(schema.jobListings.source, "jsearch"), ilike(schema.jobListings.title, q)))
    .orderBy(desc(schema.jobListings.cachedAt));
}

export async function upsertFromLinkedIn(j: LinkedInJob): Promise<JobListing> {
  const db = getDb();
  const postedAt = j.listedAt ? safeDate(j.listedAt) : null;
  const description = j.description ?? "";
  const cachedAt = new Date();

  const values = {
    source: "linkedin" as const,
    externalId: j.id,
    title: j.title,
    company: j.company,
    location: j.location ?? "",
    url: j.url ?? null,
    description,
    postedAt,
    salaryMin: typeof j.salaryMin === "number" ? j.salaryMin : null,
    salaryMax: typeof j.salaryMax === "number" ? j.salaryMax : null,
    salaryCurrency: j.salaryCurrency ?? null,
    rawJson: (j.raw ?? null) as unknown as Record<string, unknown> | null,
    cachedAt,
  };

  // Only overwrite description when the incoming row has a non-empty value.
  const setOnConflict: Record<string, unknown> = {
    cachedAt,
  };
  if (description.length > 0) {
    setOnConflict.description = description;
  }

  const rows = await db
    .insert(schema.jobListings)
    .values(values)
    .onConflictDoUpdate({
      target: [schema.jobListings.source, schema.jobListings.externalId],
      set: setOnConflict,
    })
    .returning();
  return rows[0];
}

function safeDate(value: string): Date | null {
  try {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

function normalizeKey(row: JobListing): string {
  return `${row.title.trim().toLowerCase()}|${row.company.trim().toLowerCase()}`;
}

export function dedupAcrossSources(rows: JobListing[]): JobListing[] {
  // Preserve original ordering via first-seen index per group.
  const order: string[] = [];
  const groups = new Map<string, JobListing[]>();

  for (const row of rows) {
    const key = normalizeKey(row);
    const existing = groups.get(key);
    if (existing) {
      existing.push(row);
    } else {
      groups.set(key, [row]);
      order.push(key);
    }
  }

  const result: JobListing[] = [];
  for (const key of order) {
    const group = groups.get(key);
    if (!group || group.length === 0) continue;
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }
    let best = group[0];
    for (let i = 1; i < group.length; i += 1) {
      const candidate = group[i];
      const bestLen = (best.description ?? "").length;
      const candLen = (candidate.description ?? "").length;
      if (candLen > bestLen) {
        best = candidate;
      } else if (candLen === bestLen) {
        if (candidate.source === "linkedin" && best.source !== "linkedin") {
          best = candidate;
        }
      }
    }
    result.push(best);
  }
  return result;
}

export async function updateJobDescription(id: number, description: string): Promise<void> {
  const db = getDb();
  await db
    .update(schema.jobListings)
    .set({
      description,
      cachedAt: sql`now()`,
    })
    .where(eq(schema.jobListings.id, id));
}
