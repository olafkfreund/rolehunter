import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { Interview } from "../db/schema";

export type InterviewType =
  | "phone"
  | "video"
  | "onsite"
  | "take_home"
  | "technical"
  | "system_design"
  | "behavioral"
  | "final";

export type InterviewStatus =
  | "scheduled"
  | "completed"
  | "cancelled"
  | "no_show";

export type InterviewRow = Interview;

export type InterviewWithJob = Interview & {
  job: {
    id: number;
    title: string;
    company: string;
  };
  applicationStage: string;
};

export type InterviewCreateInput = {
  applicationId: number;
  scheduledAt: Date;
  durationMin?: number;
  type: InterviewType;
  status?: InterviewStatus;
  interviewerName?: string | null;
  interviewerTitle?: string | null;
  meetingUrl?: string | null;
  locationText?: string | null;
  prepNotesMd?: string;
  postNotesMd?: string;
};

export type InterviewUpdateInput = Partial<
  Omit<InterviewCreateInput, "applicationId">
>;

export async function listForApplication(
  applicationId: number,
): Promise<InterviewRow[]> {
  const db = getDb();
  return db
    .select()
    .from(schema.interviews)
    .where(eq(schema.interviews.applicationId, applicationId))
    .orderBy(asc(schema.interviews.scheduledAt));
}

export async function listUpcoming(days = 14): Promise<InterviewWithJob[]> {
  const db = getDb();
  const now = new Date();
  const until = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      id: schema.interviews.id,
      applicationId: schema.interviews.applicationId,
      scheduledAt: schema.interviews.scheduledAt,
      durationMin: schema.interviews.durationMin,
      type: schema.interviews.type,
      status: schema.interviews.status,
      interviewerName: schema.interviews.interviewerName,
      interviewerTitle: schema.interviews.interviewerTitle,
      meetingUrl: schema.interviews.meetingUrl,
      locationText: schema.interviews.locationText,
      prepNotesMd: schema.interviews.prepNotesMd,
      postNotesMd: schema.interviews.postNotesMd,
      reminderSentAt: schema.interviews.reminderSentAt,
      createdAt: schema.interviews.createdAt,
      updatedAt: schema.interviews.updatedAt,
      jobId: schema.jobListings.id,
      jobTitle: schema.jobListings.title,
      jobCompany: schema.jobListings.company,
      applicationStage: schema.applications.stage,
    })
    .from(schema.interviews)
    .innerJoin(
      schema.applications,
      eq(schema.interviews.applicationId, schema.applications.id),
    )
    .innerJoin(
      schema.jobListings,
      eq(schema.applications.jobId, schema.jobListings.id),
    )
    .where(
      and(
        eq(schema.interviews.status, "scheduled"),
        gte(schema.interviews.scheduledAt, now),
        lte(schema.interviews.scheduledAt, until),
      ),
    )
    .orderBy(asc(schema.interviews.scheduledAt));

  return rows.map((r) => ({
    id: r.id,
    applicationId: r.applicationId,
    scheduledAt: r.scheduledAt,
    durationMin: r.durationMin,
    type: r.type,
    status: r.status,
    interviewerName: r.interviewerName,
    interviewerTitle: r.interviewerTitle,
    meetingUrl: r.meetingUrl,
    locationText: r.locationText,
    prepNotesMd: r.prepNotesMd,
    postNotesMd: r.postNotesMd,
    reminderSentAt: r.reminderSentAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    job: {
      id: r.jobId,
      title: r.jobTitle,
      company: r.jobCompany,
    },
    applicationStage: r.applicationStage,
  }));
}

export async function listAllWithJob(
  status?: InterviewStatus,
  limit = 100,
): Promise<InterviewWithJob[]> {
  const db = getDb();
  const whereClause = status
    ? eq(schema.interviews.status, status)
    : undefined;

  const base = db
    .select({
      id: schema.interviews.id,
      applicationId: schema.interviews.applicationId,
      scheduledAt: schema.interviews.scheduledAt,
      durationMin: schema.interviews.durationMin,
      type: schema.interviews.type,
      status: schema.interviews.status,
      interviewerName: schema.interviews.interviewerName,
      interviewerTitle: schema.interviews.interviewerTitle,
      meetingUrl: schema.interviews.meetingUrl,
      locationText: schema.interviews.locationText,
      prepNotesMd: schema.interviews.prepNotesMd,
      postNotesMd: schema.interviews.postNotesMd,
      reminderSentAt: schema.interviews.reminderSentAt,
      createdAt: schema.interviews.createdAt,
      updatedAt: schema.interviews.updatedAt,
      jobId: schema.jobListings.id,
      jobTitle: schema.jobListings.title,
      jobCompany: schema.jobListings.company,
      applicationStage: schema.applications.stage,
    })
    .from(schema.interviews)
    .innerJoin(
      schema.applications,
      eq(schema.interviews.applicationId, schema.applications.id),
    )
    .innerJoin(
      schema.jobListings,
      eq(schema.applications.jobId, schema.jobListings.id),
    );

  const rows = await (whereClause ? base.where(whereClause) : base)
    .orderBy(desc(schema.interviews.scheduledAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    applicationId: r.applicationId,
    scheduledAt: r.scheduledAt,
    durationMin: r.durationMin,
    type: r.type,
    status: r.status,
    interviewerName: r.interviewerName,
    interviewerTitle: r.interviewerTitle,
    meetingUrl: r.meetingUrl,
    locationText: r.locationText,
    prepNotesMd: r.prepNotesMd,
    postNotesMd: r.postNotesMd,
    reminderSentAt: r.reminderSentAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    job: {
      id: r.jobId,
      title: r.jobTitle,
      company: r.jobCompany,
    },
    applicationStage: r.applicationStage,
  }));
}

export async function getInterview(id: number): Promise<InterviewRow | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.interviews)
    .where(eq(schema.interviews.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function createInterview(
  values: InterviewCreateInput,
): Promise<InterviewRow> {
  const db = getDb();
  const now = new Date();
  const inserted = await db
    .insert(schema.interviews)
    .values({
      applicationId: values.applicationId,
      scheduledAt: values.scheduledAt,
      durationMin: values.durationMin ?? 45,
      type: values.type,
      status: values.status ?? "scheduled",
      interviewerName: values.interviewerName ?? null,
      interviewerTitle: values.interviewerTitle ?? null,
      meetingUrl: values.meetingUrl ?? null,
      locationText: values.locationText ?? null,
      prepNotesMd: values.prepNotesMd ?? "",
      postNotesMd: values.postNotesMd ?? "",
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return inserted[0];
}

export async function updateInterview(
  id: number,
  values: InterviewUpdateInput,
): Promise<InterviewRow> {
  const db = getDb();
  const patch: Record<string, unknown> = {
    updatedAt: new Date(),
  };
  if (values.scheduledAt !== undefined) patch.scheduledAt = values.scheduledAt;
  if (values.durationMin !== undefined) patch.durationMin = values.durationMin;
  if (values.type !== undefined) patch.type = values.type;
  if (values.status !== undefined) patch.status = values.status;
  if (values.interviewerName !== undefined)
    patch.interviewerName = values.interviewerName;
  if (values.interviewerTitle !== undefined)
    patch.interviewerTitle = values.interviewerTitle;
  if (values.meetingUrl !== undefined) patch.meetingUrl = values.meetingUrl;
  if (values.locationText !== undefined) patch.locationText = values.locationText;
  if (values.prepNotesMd !== undefined) patch.prepNotesMd = values.prepNotesMd;
  if (values.postNotesMd !== undefined) patch.postNotesMd = values.postNotesMd;

  const updated = await db
    .update(schema.interviews)
    .set(patch)
    .where(eq(schema.interviews.id, id))
    .returning();
  if (!updated[0]) {
    throw new Error(`Interview ${id} not found`);
  }
  return updated[0];
}

export async function markCompleted(
  id: number,
  postNotesMd?: string,
): Promise<InterviewRow> {
  const patch: InterviewUpdateInput = { status: "completed" };
  if (postNotesMd !== undefined) patch.postNotesMd = postNotesMd;
  return updateInterview(id, patch);
}

export async function deleteInterview(id: number): Promise<void> {
  const db = getDb();
  await db.delete(schema.interviews).where(eq(schema.interviews.id, id));
}
