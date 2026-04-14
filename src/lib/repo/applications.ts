import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { Application } from "../db/schema";

export type ApplicationStage =
  | "saved"
  | "applied"
  | "phone"
  | "onsite"
  | "offer"
  | "rejected";

export type ApplicationPriority = "low" | "medium" | "high";

export type ApplicationWithJob = {
  id: number;
  jobId: number;
  stage: ApplicationStage;
  priority: ApplicationPriority;
  appliedAt: Date | null;
  notesMd: string;
  reminderAt: Date | null;
  lastContact: Date | null;
  excitement: number | null;
  updatedAt: Date;
  job: {
    title: string;
    company: string;
    location: string;
    url: string | null;
  };
};

export async function listApplicationsWithJob(): Promise<ApplicationWithJob[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: schema.applications.id,
      jobId: schema.applications.jobId,
      stage: schema.applications.stage,
      priority: schema.applications.priority,
      appliedAt: schema.applications.appliedAt,
      notesMd: schema.applications.notesMd,
      reminderAt: schema.applications.reminderAt,
      lastContact: schema.applications.lastContact,
      excitement: schema.applications.excitement,
      updatedAt: schema.applications.updatedAt,
      jobTitle: schema.jobListings.title,
      jobCompany: schema.jobListings.company,
      jobLocation: schema.jobListings.location,
      jobUrl: schema.jobListings.url,
    })
    .from(schema.applications)
    .innerJoin(
      schema.jobListings,
      eq(schema.applications.jobId, schema.jobListings.id),
    )
    .orderBy(desc(schema.applications.updatedAt));

  return rows.map((r) => ({
    id: r.id,
    jobId: r.jobId,
    stage: r.stage as ApplicationStage,
    priority: r.priority as ApplicationPriority,
    appliedAt: r.appliedAt,
    notesMd: r.notesMd,
    reminderAt: r.reminderAt,
    lastContact: r.lastContact,
    excitement: r.excitement,
    updatedAt: r.updatedAt,
    job: {
      title: r.jobTitle,
      company: r.jobCompany,
      location: r.jobLocation,
      url: r.jobUrl,
    },
  }));
}

export async function getApplicationByJobId(
  jobId: number,
): Promise<ApplicationWithJob | null> {
  const all = await listApplicationsWithJob();
  return all.find((a) => a.jobId === jobId) ?? null;
}

export async function updateApplication(
  id: number,
  patch: {
    stage?: ApplicationStage;
    priority?: ApplicationPriority;
    notesMd?: string;
    reminderAt?: Date | null;
    lastContact?: Date | null;
    excitement?: number | null;
  },
): Promise<Application> {
  const db = getDb();
  const sets: Partial<Application> = { updatedAt: new Date() };
  if (patch.stage !== undefined) {
    const current = await db
      .select()
      .from(schema.applications)
      .where(eq(schema.applications.id, id))
      .limit(1);
    const existing = current[0];
    sets.stage = patch.stage;
    if (patch.stage === "applied" && existing && !existing.appliedAt) {
      sets.appliedAt = sets.updatedAt;
    }
  }
  if (patch.priority !== undefined) sets.priority = patch.priority;
  if (patch.notesMd !== undefined) sets.notesMd = patch.notesMd;
  if (patch.reminderAt !== undefined) sets.reminderAt = patch.reminderAt;
  if (patch.lastContact !== undefined) sets.lastContact = patch.lastContact;
  if (patch.excitement !== undefined) sets.excitement = patch.excitement;
  const updated = await db
    .update(schema.applications)
    .set(sets)
    .where(eq(schema.applications.id, id))
    .returning();
  if (!updated[0]) throw new Error(`Application ${id} not found`);
  return updated[0];
}

export async function findApplicationByJobId(
  jobId: number,
): Promise<Application | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.applications)
    .where(eq(schema.applications.jobId, jobId))
    .limit(1);
  return rows[0] ?? null;
}

export async function createApplication(input: {
  jobId: number;
  stage?: ApplicationStage;
}): Promise<Application> {
  const db = getDb();
  const stage: ApplicationStage = input.stage ?? "saved";
  const now = new Date();
  const inserted = await db
    .insert(schema.applications)
    .values({
      jobId: input.jobId,
      stage,
      appliedAt: stage === "applied" ? now : null,
      updatedAt: now,
    })
    .returning();
  return inserted[0];
}

export async function updateApplicationStage(
  id: number,
  stage: ApplicationStage,
): Promise<Application> {
  const db = getDb();
  const current = await db
    .select()
    .from(schema.applications)
    .where(eq(schema.applications.id, id))
    .limit(1);
  const existing = current[0];
  if (!existing) {
    throw new Error(`Application ${id} not found`);
  }
  const now = new Date();
  const patch: Partial<Application> = {
    stage,
    updatedAt: now,
  };
  if (stage === "applied" && !existing.appliedAt) {
    patch.appliedAt = now;
  }
  const updated = await db
    .update(schema.applications)
    .set(patch)
    .where(eq(schema.applications.id, id))
    .returning();
  return updated[0];
}

export async function updateApplicationNotes(
  id: number,
  notesMd: string,
  reminderAt?: Date | null,
): Promise<Application> {
  const db = getDb();
  const patch: Partial<Application> = {
    notesMd,
    updatedAt: new Date(),
  };
  if (reminderAt !== undefined) {
    patch.reminderAt = reminderAt;
  }
  const updated = await db
    .update(schema.applications)
    .set(patch)
    .where(eq(schema.applications.id, id))
    .returning();
  return updated[0];
}

export async function deleteApplication(id: number): Promise<void> {
  const db = getDb();
  await db.delete(schema.applications).where(eq(schema.applications.id, id));
}
