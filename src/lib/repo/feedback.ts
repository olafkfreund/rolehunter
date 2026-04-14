import { desc, eq, isNotNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { InterviewFeedback } from "@/lib/db/schema";
import type { FeedbackEntry } from "@/lib/llm/types";

export type FeedbackSource = "recruiter" | "self" | "llm_synthesis";
export type RejectionCategory =
  | "resume_screen"
  | "technical"
  | "behavioral"
  | "culture"
  | "salary"
  | "position_closed"
  | "other";

export type FeedbackWithJob = InterviewFeedback & {
  job: {
    id: number;
    title: string;
    company: string;
  };
  applicationStage: string;
};

export type CreateFeedbackInput = {
  applicationId: number;
  interviewId?: number | null;
  source?: FeedbackSource;
  rejectionCategory?: RejectionCategory | null;
  rating?: number | null;
  whatWentWellMd?: string;
  whatWentBadlyMd?: string;
  whatToChangeMd?: string;
  recruiterVerbatim?: string | null;
};

export type UpdateFeedbackInput = Partial<CreateFeedbackInput>;

export async function listForApplication(
  appId: number,
): Promise<InterviewFeedback[]> {
  const db = getDb();
  return db
    .select()
    .from(schema.interviewFeedback)
    .where(eq(schema.interviewFeedback.applicationId, appId))
    .orderBy(desc(schema.interviewFeedback.createdAt));
}

export async function listAllWithJob(limit = 50): Promise<FeedbackWithJob[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: schema.interviewFeedback.id,
      applicationId: schema.interviewFeedback.applicationId,
      interviewId: schema.interviewFeedback.interviewId,
      source: schema.interviewFeedback.source,
      rejectionCategory: schema.interviewFeedback.rejectionCategory,
      rating: schema.interviewFeedback.rating,
      whatWentWellMd: schema.interviewFeedback.whatWentWellMd,
      whatWentBadlyMd: schema.interviewFeedback.whatWentBadlyMd,
      whatToChangeMd: schema.interviewFeedback.whatToChangeMd,
      recruiterVerbatim: schema.interviewFeedback.recruiterVerbatim,
      createdAt: schema.interviewFeedback.createdAt,
      jobId: schema.jobListings.id,
      jobTitle: schema.jobListings.title,
      jobCompany: schema.jobListings.company,
      applicationStage: schema.applications.stage,
    })
    .from(schema.interviewFeedback)
    .innerJoin(
      schema.applications,
      eq(schema.interviewFeedback.applicationId, schema.applications.id),
    )
    .innerJoin(
      schema.jobListings,
      eq(schema.applications.jobId, schema.jobListings.id),
    )
    .orderBy(desc(schema.interviewFeedback.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    applicationId: r.applicationId,
    interviewId: r.interviewId,
    source: r.source,
    rejectionCategory: r.rejectionCategory,
    rating: r.rating,
    whatWentWellMd: r.whatWentWellMd,
    whatWentBadlyMd: r.whatWentBadlyMd,
    whatToChangeMd: r.whatToChangeMd,
    recruiterVerbatim: r.recruiterVerbatim,
    createdAt: r.createdAt,
    applicationStage: r.applicationStage,
    job: {
      id: r.jobId,
      title: r.jobTitle,
      company: r.jobCompany,
    },
  }));
}

export async function getFeedback(
  id: number,
): Promise<InterviewFeedback | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.interviewFeedback)
    .where(eq(schema.interviewFeedback.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function createFeedback(
  values: CreateFeedbackInput,
): Promise<InterviewFeedback> {
  const db = getDb();
  const rows = await db
    .insert(schema.interviewFeedback)
    .values({
      applicationId: values.applicationId,
      interviewId: values.interviewId ?? null,
      source: values.source ?? "self",
      rejectionCategory: values.rejectionCategory ?? null,
      rating: values.rating ?? null,
      whatWentWellMd: values.whatWentWellMd ?? "",
      whatWentBadlyMd: values.whatWentBadlyMd ?? "",
      whatToChangeMd: values.whatToChangeMd ?? "",
      recruiterVerbatim: values.recruiterVerbatim ?? null,
    })
    .returning();
  return rows[0];
}

export async function updateFeedback(
  id: number,
  values: UpdateFeedbackInput,
): Promise<InterviewFeedback | null> {
  const db = getDb();
  const patch: Record<string, unknown> = {};
  if (values.interviewId !== undefined) patch.interviewId = values.interviewId;
  if (values.source !== undefined) patch.source = values.source;
  if (values.rejectionCategory !== undefined)
    patch.rejectionCategory = values.rejectionCategory;
  if (values.rating !== undefined) patch.rating = values.rating;
  if (values.whatWentWellMd !== undefined)
    patch.whatWentWellMd = values.whatWentWellMd;
  if (values.whatWentBadlyMd !== undefined)
    patch.whatWentBadlyMd = values.whatWentBadlyMd;
  if (values.whatToChangeMd !== undefined)
    patch.whatToChangeMd = values.whatToChangeMd;
  if (values.recruiterVerbatim !== undefined)
    patch.recruiterVerbatim = values.recruiterVerbatim;

  if (Object.keys(patch).length === 0) {
    return getFeedback(id);
  }

  const rows = await db
    .update(schema.interviewFeedback)
    .set(patch)
    .where(eq(schema.interviewFeedback.id, id))
    .returning();
  return rows[0] ?? null;
}

export async function deleteFeedback(id: number): Promise<void> {
  const db = getDb();
  await db
    .delete(schema.interviewFeedback)
    .where(eq(schema.interviewFeedback.id, id));
}

export async function rejectionPatterns(): Promise<
  Array<{ category: string; count: number }>
> {
  const db = getDb();
  const rows = await db
    .select({
      category: schema.interviewFeedback.rejectionCategory,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.interviewFeedback)
    .where(isNotNull(schema.interviewFeedback.rejectionCategory))
    .groupBy(schema.interviewFeedback.rejectionCategory)
    .orderBy(sql`count(*) desc`);

  return rows
    .filter((r) => r.category !== null)
    .map((r) => ({ category: r.category as string, count: Number(r.count) }));
}

export async function recentForAnalysis(
  limit = 20,
): Promise<FeedbackEntry[]> {
  const db = getDb();
  const rows = await db
    .select({
      rejectionCategory: schema.interviewFeedback.rejectionCategory,
      rating: schema.interviewFeedback.rating,
      whatWentWellMd: schema.interviewFeedback.whatWentWellMd,
      whatWentBadlyMd: schema.interviewFeedback.whatWentBadlyMd,
      whatToChangeMd: schema.interviewFeedback.whatToChangeMd,
      recruiterVerbatim: schema.interviewFeedback.recruiterVerbatim,
      createdAt: schema.interviewFeedback.createdAt,
      stage: schema.applications.stage,
      jobTitle: schema.jobListings.title,
      company: schema.jobListings.company,
    })
    .from(schema.interviewFeedback)
    .innerJoin(
      schema.applications,
      eq(schema.interviewFeedback.applicationId, schema.applications.id),
    )
    .innerJoin(
      schema.jobListings,
      eq(schema.applications.jobId, schema.jobListings.id),
    )
    .orderBy(desc(schema.interviewFeedback.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    jobTitle: r.jobTitle,
    company: r.company,
    stage: r.stage,
    rejectionCategory: r.rejectionCategory,
    rating: r.rating,
    whatWentWellMd: r.whatWentWellMd,
    whatWentBadlyMd: r.whatWentBadlyMd,
    whatToChangeMd: r.whatToChangeMd,
    recruiterVerbatim: r.recruiterVerbatim,
    createdAt:
      r.createdAt instanceof Date
        ? r.createdAt.toISOString()
        : String(r.createdAt),
  }));
}
