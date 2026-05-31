import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { SearchProfile, SearchRun } from "@/lib/db/schema";

export type CreateProfileInput = {
  name: string;
  query: string;
  location?: string | null;
  locationRadiusKm?: number | null;
  salaryMinUsd?: number | null;
  salaryMaxUsd?: number | null;
  salaryCurrency?: string | null;
  remoteModes?: string[];
  experienceLevels?: string[];
  jobTypes?: string[];
  sources: string[];
  frequency: "hourly" | "every_4h" | "daily" | "weekly";
  maxResultsPerRun?: number;
  active?: boolean;
};

export async function listProfiles(): Promise<SearchProfile[]> {
  const db = getDb();
  return db
    .select()
    .from(schema.searchProfiles)
    .orderBy(desc(schema.searchProfiles.createdAt));
}

export async function getProfile(id: number): Promise<SearchProfile | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.searchProfiles)
    .where(eq(schema.searchProfiles.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function createProfile(input: CreateProfileInput): Promise<SearchProfile> {
  const db = getDb();
  const [row] = await db
    .insert(schema.searchProfiles)
    .values({
      name: input.name,
      query: input.query,
      location: input.location ?? null,
      locationRadiusKm: input.locationRadiusKm ?? null,
      salaryMinUsd: input.salaryMinUsd ?? null,
      salaryMaxUsd: input.salaryMaxUsd ?? null,
      salaryCurrency: input.salaryCurrency ?? "USD",
      remoteModes: input.remoteModes ?? [],
      experienceLevels: input.experienceLevels ?? [],
      jobTypes: input.jobTypes ?? [],
      sources: input.sources,
      frequency: input.frequency,
      maxResultsPerRun: input.maxResultsPerRun ?? 50,
      active: input.active ?? true,
    })
    .returning();
  return row;
}

export async function updateProfile(
  id: number,
  patch: Partial<CreateProfileInput>,
): Promise<SearchProfile | null> {
  const db = getDb();
  const updates: Record<string, unknown> = { updatedAt: sql`NOW()` };
  if (patch.name !== undefined) updates.name = patch.name;
  if (patch.query !== undefined) updates.query = patch.query;
  if (patch.location !== undefined) updates.location = patch.location;
  if (patch.locationRadiusKm !== undefined) updates.locationRadiusKm = patch.locationRadiusKm;
  if (patch.salaryMinUsd !== undefined) updates.salaryMinUsd = patch.salaryMinUsd;
  if (patch.salaryMaxUsd !== undefined) updates.salaryMaxUsd = patch.salaryMaxUsd;
  if (patch.salaryCurrency !== undefined) updates.salaryCurrency = patch.salaryCurrency;
  if (patch.remoteModes !== undefined) updates.remoteModes = patch.remoteModes;
  if (patch.experienceLevels !== undefined) updates.experienceLevels = patch.experienceLevels;
  if (patch.jobTypes !== undefined) updates.jobTypes = patch.jobTypes;
  if (patch.sources !== undefined) updates.sources = patch.sources;
  if (patch.frequency !== undefined) updates.frequency = patch.frequency;
  if (patch.maxResultsPerRun !== undefined) updates.maxResultsPerRun = patch.maxResultsPerRun;
  if (patch.active !== undefined) updates.active = patch.active;

  const [row] = await db
    .update(schema.searchProfiles)
    .set(updates)
    .where(eq(schema.searchProfiles.id, id))
    .returning();
  return row ?? null;
}

export async function deleteProfile(id: number): Promise<boolean> {
  const db = getDb();
  const result = await db
    .delete(schema.searchProfiles)
    .where(eq(schema.searchProfiles.id, id))
    .returning({ id: schema.searchProfiles.id });
  return result.length > 0;
}

export async function triggerRunNow(id: number): Promise<SearchProfile | null> {
  const db = getDb();
  const [row] = await db
    .update(schema.searchProfiles)
    .set({ nextRunAt: sql`NOW()`, updatedAt: sql`NOW()` })
    .where(eq(schema.searchProfiles.id, id))
    .returning();
  return row ?? null;
}

export async function listProfileRuns(profileId: number, limit = 20): Promise<SearchRun[]> {
  const db = getDb();
  return db
    .select()
    .from(schema.searchRuns)
    .where(eq(schema.searchRuns.profileId, profileId))
    .orderBy(desc(schema.searchRuns.startedAt))
    .limit(limit);
}

export interface ProfileStats {
  totalRuns: number;
  successRuns: number;
  jobsNewLast7d: number;
  lastRunAt: Date | null;
}

export async function getProfileStats(profileId: number): Promise<ProfileStats> {
  const db = getDb();
  const rows = await db
    .select({
      status: schema.searchRuns.status,
      jobsNew: schema.searchRuns.jobsNew,
      startedAt: schema.searchRuns.startedAt,
    })
    .from(schema.searchRuns)
    .where(
      and(
        eq(schema.searchRuns.profileId, profileId),
        sql`${schema.searchRuns.startedAt} > NOW() - interval '7 days'`,
      ),
    );

  let totalRuns = 0;
  let successRuns = 0;
  let jobsNewLast7d = 0;
  let lastRunAt: Date | null = null;
  for (const r of rows) {
    totalRuns++;
    if (r.status === "success") successRuns++;
    jobsNewLast7d += r.jobsNew;
    if (!lastRunAt || r.startedAt > lastRunAt) lastRunAt = r.startedAt;
  }
  return { totalRuns, successRuns, jobsNewLast7d, lastRunAt };
}
