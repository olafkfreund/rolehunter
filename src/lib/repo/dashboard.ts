import { and, asc, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { Provider } from "@/lib/llm/types";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type DashboardStage =
  | "saved"
  | "applied"
  | "phone"
  | "onsite"
  | "offer"
  | "rejected";

export type RejectionCategory =
  | "resume_screen"
  | "technical"
  | "behavioral"
  | "culture"
  | "salary"
  | "position_closed"
  | "other";

export type FeedbackSource = "recruiter" | "self" | "llm_synthesis";

export type InterviewStatus =
  | "scheduled"
  | "completed"
  | "cancelled"
  | "no_show";

// ---------------------------------------------------------------------------
// 1) Top scored matches (deduped by job, highest-scoring per job)
// ---------------------------------------------------------------------------

export type TopScoredMatch = {
  matchId: number;
  score: number;
  provider: Provider;
  createdAt: string;
  jobId: number;
  jobTitle: string;
  company: string;
  location: string;
  stage: DashboardStage | null;
};

type TopScoredRawRow = {
  match_id: number;
  score: number;
  provider: Provider;
  created_at: Date | string;
  job_id: number;
  job_title: string;
  company: string;
  location: string;
};

type StageRawRow = {
  job_id: number;
  stage: DashboardStage;
};

function toIso(value: Date | string | null | undefined): string {
  if (!value) return new Date(0).toISOString();
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export async function getTopScoredMatches(
  limit = 10,
): Promise<TopScoredMatch[]> {
  const db = getDb();

  // Dedup by job_id using a window function: keep the highest-scoring
  // match per job, ordered by score desc then most recent.
  // Exclude hidden jobs so /jobs and the dashboard agree on what's
  // worth surfacing.
  const matchesResult = await db.execute(sql`
    SELECT match_id, score, provider, created_at, job_id, job_title, company, location
    FROM (
      SELECT
        m.id          AS match_id,
        m.score       AS score,
        m.provider    AS provider,
        m.created_at  AS created_at,
        j.id          AS job_id,
        j.title       AS job_title,
        j.company     AS company,
        j.location    AS location,
        ROW_NUMBER() OVER (
          PARTITION BY j.id
          ORDER BY m.score DESC, m.created_at DESC
        ) AS rn
      FROM matches m
      INNER JOIN job_listings j ON j.id = m.job_id
      WHERE j.hidden = false
    ) t
    WHERE rn = 1
    ORDER BY score DESC, created_at DESC
    LIMIT ${limit}
  `);

  const rows = matchesResult.rows as unknown as TopScoredRawRow[];
  if (rows.length === 0) return [];

  const jobIds = rows.map((r) => r.job_id);

  // Most-recent application stage per job (DISTINCT ON).
  const stageResult = await db.execute(sql`
    SELECT DISTINCT ON (job_id) job_id, stage
    FROM applications
    WHERE job_id = ANY(${sql.raw(`ARRAY[${jobIds.join(",")}]::int[]`)})
    ORDER BY job_id, updated_at DESC
  `);

  const stageRows = stageResult.rows as unknown as StageRawRow[];
  const stageByJob = new Map<number, DashboardStage>();
  for (const s of stageRows) stageByJob.set(s.job_id, s.stage);

  return rows.map((r) => ({
    matchId: r.match_id,
    score: r.score,
    provider: r.provider,
    createdAt: toIso(r.created_at),
    jobId: r.job_id,
    jobTitle: r.job_title,
    company: r.company,
    location: r.location,
    stage: stageByJob.get(r.job_id) ?? null,
  }));
}

// ---------------------------------------------------------------------------
// 2) Upcoming interviews (next N days, scheduled only)
// ---------------------------------------------------------------------------

export type InterviewType =
  | "phone"
  | "video"
  | "onsite"
  | "take_home"
  | "technical"
  | "system_design"
  | "behavioral"
  | "final";

export type UpcomingInterview = {
  id: number;
  scheduledAt: string;
  durationMin: number;
  type: InterviewType;
  status: InterviewStatus;
  interviewerName: string | null;
  interviewerTitle: string | null;
  meetingUrl: string | null;
  locationText: string | null;
  applicationId: number;
  jobId: number;
  jobTitle: string;
  company: string;
  stage: DashboardStage;
};

export async function getUpcomingInterviews(
  days = 14,
): Promise<UpcomingInterview[]> {
  const db = getDb();
  const now = new Date();
  const until = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      id: schema.interviews.id,
      scheduledAt: schema.interviews.scheduledAt,
      durationMin: schema.interviews.durationMin,
      type: schema.interviews.type,
      status: schema.interviews.status,
      interviewerName: schema.interviews.interviewerName,
      interviewerTitle: schema.interviews.interviewerTitle,
      meetingUrl: schema.interviews.meetingUrl,
      locationText: schema.interviews.locationText,
      applicationId: schema.interviews.applicationId,
      jobId: schema.jobListings.id,
      jobTitle: schema.jobListings.title,
      company: schema.jobListings.company,
      stage: schema.applications.stage,
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
    scheduledAt: toIso(r.scheduledAt),
    durationMin: r.durationMin,
    type: r.type,
    status: r.status,
    interviewerName: r.interviewerName,
    interviewerTitle: r.interviewerTitle,
    meetingUrl: r.meetingUrl,
    locationText: r.locationText,
    applicationId: r.applicationId,
    jobId: r.jobId,
    jobTitle: r.jobTitle,
    company: r.company,
    stage: r.stage,
  }));
}

// ---------------------------------------------------------------------------
// 3) Action queue
// ---------------------------------------------------------------------------

export type ActionItemKind = "thank_you" | "followup" | "stale";

export type ActionItem = {
  kind: ActionItemKind;
  applicationId: number;
  jobId: number;
  jobTitle: string;
  company: string;
  hint: string;
  timestamp: string;
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function hoursAgoLabel(then: Date): string {
  const diffH = Math.max(0, Math.round((Date.now() - then.getTime()) / HOUR_MS));
  if (diffH < 1) return "less than an hour ago";
  if (diffH === 1) return "1 hour ago";
  return `${diffH} hours ago`;
}

function daysAgoLabel(then: Date): string {
  const diffD = Math.max(0, Math.floor((Date.now() - then.getTime()) / DAY_MS));
  if (diffD < 1) return "today";
  if (diffD === 1) return "1 day";
  return `${diffD} days`;
}

export async function getActionQueue(): Promise<ActionItem[]> {
  const db = getDb();
  const now = new Date();
  const seventyTwoAgo = new Date(now.getTime() - 72 * HOUR_MS);
  const fiveDaysAgo = new Date(now.getTime() - 5 * DAY_MS);
  const tenDaysAgo = new Date(now.getTime() - 10 * DAY_MS);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * DAY_MS);

  // ---- thank_you: completed interviews in last 72h with no feedback row ---
  const thankYouRows = await db
    .select({
      interviewId: schema.interviews.id,
      scheduledAt: schema.interviews.scheduledAt,
      interviewerName: schema.interviews.interviewerName,
      applicationId: schema.interviews.applicationId,
      jobId: schema.jobListings.id,
      jobTitle: schema.jobListings.title,
      company: schema.jobListings.company,
      feedbackId: schema.interviewFeedback.id,
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
    .leftJoin(
      schema.interviewFeedback,
      eq(schema.interviewFeedback.interviewId, schema.interviews.id),
    )
    .where(
      and(
        eq(schema.interviews.status, "completed"),
        gte(schema.interviews.scheduledAt, seventyTwoAgo),
        lte(schema.interviews.scheduledAt, now),
        isNull(schema.interviewFeedback.id),
      ),
    );

  const thankYouItems: ActionItem[] = thankYouRows.map((r) => {
    const who = r.interviewerName?.trim() || r.company;
    return {
      kind: "thank_you",
      applicationId: r.applicationId,
      jobId: r.jobId,
      jobTitle: r.jobTitle,
      company: r.company,
      hint: `Interview with ${who} completed ${hoursAgoLabel(r.scheduledAt)}`,
      timestamp: toIso(r.scheduledAt),
    };
  });

  // ---- followup: applied 5-10 days ago -----------------------------------
  const followupRows = await db
    .select({
      applicationId: schema.applications.id,
      appliedAt: schema.applications.appliedAt,
      jobId: schema.jobListings.id,
      jobTitle: schema.jobListings.title,
      company: schema.jobListings.company,
    })
    .from(schema.applications)
    .innerJoin(
      schema.jobListings,
      eq(schema.applications.jobId, schema.jobListings.id),
    )
    .where(
      and(
        eq(schema.applications.stage, "applied"),
        gte(schema.applications.appliedAt, tenDaysAgo),
        lte(schema.applications.appliedAt, fiveDaysAgo),
      ),
    );

  const followupItems: ActionItem[] = followupRows
    .filter((r): r is typeof r & { appliedAt: Date } => r.appliedAt !== null)
    .map((r) => ({
      kind: "followup",
      applicationId: r.applicationId,
      jobId: r.jobId,
      jobTitle: r.jobTitle,
      company: r.company,
      hint: `Applied ${daysAgoLabel(r.appliedAt)} ago — time to follow up`,
      timestamp: toIso(r.appliedAt),
    }));

  // ---- stale: applied > 14 days ago, still in `applied` ------------------
  const staleRows = await db
    .select({
      applicationId: schema.applications.id,
      appliedAt: schema.applications.appliedAt,
      jobId: schema.jobListings.id,
      jobTitle: schema.jobListings.title,
      company: schema.jobListings.company,
    })
    .from(schema.applications)
    .innerJoin(
      schema.jobListings,
      eq(schema.applications.jobId, schema.jobListings.id),
    )
    .where(
      and(
        eq(schema.applications.stage, "applied"),
        lte(schema.applications.appliedAt, fourteenDaysAgo),
      ),
    );

  const staleItems: ActionItem[] = staleRows
    .filter((r): r is typeof r & { appliedAt: Date } => r.appliedAt !== null)
    .map((r) => ({
      kind: "stale",
      applicationId: r.applicationId,
      jobId: r.jobId,
      jobTitle: r.jobTitle,
      company: r.company,
      hint: `Applied ${daysAgoLabel(r.appliedAt)} ago — consider archiving`,
      timestamp: toIso(r.appliedAt),
    }));

  // ---- combine, dedup, sort, cap -----------------------------------------
  const combined = [...thankYouItems, ...followupItems, ...staleItems];
  const seen = new Set<string>();
  const deduped: ActionItem[] = [];
  for (const item of combined) {
    const key = `${item.kind}:${item.applicationId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  const priority: Record<ActionItemKind, number> = {
    thank_you: 0,
    followup: 1,
    stale: 2,
  };

  deduped.sort((a, b) => {
    const dp = priority[a.kind] - priority[b.kind];
    if (dp !== 0) return dp;
    return b.timestamp.localeCompare(a.timestamp);
  });

  return deduped.slice(0, 20);
}

// ---------------------------------------------------------------------------
// 4) Latest tailored CV
// ---------------------------------------------------------------------------

export type LatestTailoredCv = {
  variantId: number;
  createdAt: string;
  jobId: number;
  jobTitle: string;
  company: string;
  pdfPath: string | null;
  score: number | null;
  provider: Provider;
};

export async function getLatestTailoredCv(): Promise<LatestTailoredCv | null> {
  const db = getDb();

  const variantRows = await db
    .select({
      variantId: schema.cvVariants.id,
      createdAt: schema.cvVariants.createdAt,
      pdfPath: schema.cvVariants.pdfPath,
      provider: schema.cvVariants.provider,
      jobId: schema.jobListings.id,
      jobTitle: schema.jobListings.title,
      company: schema.jobListings.company,
    })
    .from(schema.cvVariants)
    .innerJoin(
      schema.jobListings,
      eq(schema.cvVariants.jobId, schema.jobListings.id),
    )
    .orderBy(desc(schema.cvVariants.createdAt))
    .limit(1);

  const v = variantRows[0];
  if (!v) return null;

  // Latest match for this job (highest priority: highest score, newest).
  const matchRows = await db
    .select({ score: schema.matches.score })
    .from(schema.matches)
    .where(eq(schema.matches.jobId, v.jobId))
    .orderBy(desc(schema.matches.score), desc(schema.matches.createdAt))
    .limit(1);

  const score = matchRows[0]?.score ?? null;

  return {
    variantId: v.variantId,
    createdAt: toIso(v.createdAt),
    jobId: v.jobId,
    jobTitle: v.jobTitle,
    company: v.company,
    pdfPath: v.pdfPath,
    score,
    provider: v.provider,
  };
}

// ---------------------------------------------------------------------------
// 5) Application metrics
// ---------------------------------------------------------------------------

export type ApplicationMetrics = {
  totalApplied: number;
  responseRatePct: number;
  interviewRatePct: number;
  offerRatePct: number;
  avgScore: number | null;
};

const RESPONSE_STAGES: DashboardStage[] = [
  "phone",
  "onsite",
  "offer",
  "rejected",
];
const INTERVIEW_STAGES: DashboardStage[] = ["phone", "onsite", "offer"];

export async function getApplicationMetrics(): Promise<ApplicationMetrics> {
  const db = getDb();

  // Single grouped count over stages.
  const stageCountsRows = await db
    .select({
      stage: schema.applications.stage,
      cnt: sql<number>`count(*)::int`,
    })
    .from(schema.applications)
    .groupBy(schema.applications.stage);

  const counts: Partial<Record<DashboardStage, number>> = {};
  for (const r of stageCountsRows) {
    counts[r.stage as DashboardStage] = Number(r.cnt) || 0;
  }

  const totalApplied = (Object.keys(counts) as DashboardStage[])
    .filter((s) => s !== "saved")
    .reduce((sum, s) => sum + (counts[s] ?? 0), 0);

  const responseCount = RESPONSE_STAGES.reduce(
    (sum, s) => sum + (counts[s] ?? 0),
    0,
  );
  const interviewCount = INTERVIEW_STAGES.reduce(
    (sum, s) => sum + (counts[s] ?? 0),
    0,
  );
  const offerCount = counts.offer ?? 0;

  const pct = (n: number, d: number) =>
    d === 0 ? 0 : Math.round((100 * n) / d);

  const avgRows = await db
    .select({ avg: sql<string | null>`avg(${schema.matches.score})` })
    .from(schema.matches);

  const avgRaw = avgRows[0]?.avg;
  const avgScore =
    avgRaw === null || avgRaw === undefined ? null : Math.round(Number(avgRaw));

  return {
    totalApplied,
    responseRatePct: pct(responseCount, totalApplied),
    interviewRatePct: pct(interviewCount, totalApplied),
    offerRatePct: pct(offerCount, totalApplied),
    avgScore: Number.isFinite(avgScore as number) ? avgScore : null,
  };
}

// ---------------------------------------------------------------------------
// 6) Recent feedback
// ---------------------------------------------------------------------------

export type RecentFeedback = {
  id: number;
  source: FeedbackSource;
  rejectionCategory: RejectionCategory | null;
  rating: number | null;
  whatWentWellMd: string;
  whatWentBadlyMd: string;
  whatToChangeMd: string;
  createdAt: string;
  applicationId: number;
  jobId: number;
  jobTitle: string;
  company: string;
};

export async function getRecentFeedback(
  limit = 5,
): Promise<RecentFeedback[]> {
  const db = getDb();

  const rows = await db
    .select({
      id: schema.interviewFeedback.id,
      source: schema.interviewFeedback.source,
      rejectionCategory: schema.interviewFeedback.rejectionCategory,
      rating: schema.interviewFeedback.rating,
      whatWentWellMd: schema.interviewFeedback.whatWentWellMd,
      whatWentBadlyMd: schema.interviewFeedback.whatWentBadlyMd,
      whatToChangeMd: schema.interviewFeedback.whatToChangeMd,
      createdAt: schema.interviewFeedback.createdAt,
      applicationId: schema.interviewFeedback.applicationId,
      jobId: schema.jobListings.id,
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
    id: r.id,
    source: r.source,
    rejectionCategory: r.rejectionCategory,
    rating: r.rating,
    whatWentWellMd: r.whatWentWellMd,
    whatWentBadlyMd: r.whatWentBadlyMd,
    whatToChangeMd: r.whatToChangeMd,
    createdAt: toIso(r.createdAt),
    applicationId: r.applicationId,
    jobId: r.jobId,
    jobTitle: r.jobTitle,
    company: r.company,
  }));
}

