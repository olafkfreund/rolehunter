import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  jsonb,
  pgEnum,
  varchar,
  index,
  uniqueIndex,
  boolean,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const jobSourceEnum = pgEnum("job_source", ["paste", "jsearch", "linkedin"]);
export const providerEnum = pgEnum("llm_provider", ["claude", "gemini"]);
export const stageEnum = pgEnum("application_stage", [
  "saved",
  "applied",
  "phone",
  "onsite",
  "offer",
  "rejected",
]);
export const priorityEnum = pgEnum("application_priority", ["low", "medium", "high"]);

export const profile = pgTable("profile", {
  id: serial("id").primaryKey(),
  fullName: text("full_name").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  location: text("location").notNull().default(""),
  summary: text("summary").notNull().default(""),
  avatarPath: text("avatar_path"),
  linkedinUrl: text("linkedin_url"),
  linkedinHeadline: text("linkedin_headline"),
  linkedinAbout: text("linkedin_about"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const cvMaster = pgTable(
  "cv_master",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull().default("My CV"),
    rawMarkdown: text("raw_markdown").notNull(),
    parsedJson: jsonb("parsed_json").notNull().default({}),
    sourceFilePath: text("source_file_path"),
    isActive: boolean("is_active").notNull().default(false),
    uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  },
  (t) => ({
    oneActiveIdx: uniqueIndex("cv_master_one_active_idx")
      .on(t.isActive)
      .where(sql`${t.isActive} = true`),
  }),
);

export const jobListings = pgTable(
  "job_listings",
  {
    id: serial("id").primaryKey(),
    source: jobSourceEnum("source").notNull(),
    externalId: varchar("external_id", { length: 255 }),
    title: text("title").notNull(),
    company: text("company").notNull().default(""),
    location: text("location").notNull().default(""),
    url: text("url"),
    description: text("description").notNull(),
    postedAt: timestamp("posted_at"),
    salaryMin: integer("salary_min"),
    salaryMax: integer("salary_max"),
    salaryCurrency: varchar("salary_currency", { length: 8 }),
    rawJson: jsonb("raw_json"),
    cachedAt: timestamp("cached_at").defaultNow().notNull(),
  },
  (t) => ({
    externalIdx: uniqueIndex("job_listings_external_idx").on(t.source, t.externalId),
    titleIdx: index("job_listings_title_idx").on(t.title),
  }),
);

export const matches = pgTable("matches", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id")
    .notNull()
    .references(() => jobListings.id, { onDelete: "cascade" }),
  cvMasterId: integer("cv_master_id")
    .notNull()
    .references(() => cvMaster.id, { onDelete: "cascade" }),
  provider: providerEnum("provider").notNull(),
  score: integer("score").notNull(),
  strengths: jsonb("strengths").notNull().default([]),
  gaps: jsonb("gaps").notNull().default([]),
  reasoningMd: text("reasoning_md").notNull().default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const cvVariants = pgTable("cv_variants", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id")
    .notNull()
    .references(() => jobListings.id, { onDelete: "cascade" }),
  matchId: integer("match_id").references(() => matches.id, { onDelete: "set null" }),
  tailoredMarkdown: text("tailored_markdown").notNull(),
  pdfPath: text("pdf_path"),
  keywords: jsonb("keywords").notNull().default([]),
  provider: providerEnum("provider").notNull(),
  theme: text("theme").notNull().default("modern"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const applications = pgTable("applications", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id")
    .notNull()
    .references(() => jobListings.id, { onDelete: "cascade" }),
  stage: stageEnum("stage").notNull().default("saved"),
  priority: priorityEnum("priority").notNull().default("medium"),
  appliedAt: timestamp("applied_at"),
  notesMd: text("notes_md").notNull().default(""),
  reminderAt: timestamp("reminder_at"),
  lastContact: timestamp("last_contact"),
  excitement: integer("excitement"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const linkedinScans = pgTable("linkedin_scans", {
  id: serial("id").primaryKey(),
  targetRole: text("target_role").notNull(),
  provider: providerEnum("provider").notNull(),
  score: integer("score").notNull(),
  keywordCoverage: jsonb("keyword_coverage").notNull().default({}),
  suggestionsMd: text("suggestions_md").notNull().default(""),
  rewrittenHeadline: text("rewritten_headline"),
  rewrittenAbout: text("rewritten_about"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const interviewTypeEnum = pgEnum("interview_type", [
  "phone",
  "video",
  "onsite",
  "take_home",
  "technical",
  "system_design",
  "behavioral",
  "final",
]);
export const interviewStatusEnum = pgEnum("interview_status", [
  "scheduled",
  "completed",
  "cancelled",
  "no_show",
]);
export const feedbackSourceEnum = pgEnum("feedback_source", [
  "recruiter",
  "self",
  "llm_synthesis",
]);
export const rejectionCategoryEnum = pgEnum("rejection_category", [
  "resume_screen",
  "technical",
  "behavioral",
  "culture",
  "salary",
  "position_closed",
  "other",
]);
export const flashcardCategoryEnum = pgEnum("flashcard_category", [
  "behavioral",
  "role_specific",
  "company_specific",
  "technical",
]);

export const learningStatusEnum = pgEnum("gap_learning_status", [
  "to_learn",
  "learning",
  "done",
  "dismissed",
]);

export const interviews = pgTable(
  "interviews",
  {
    id: serial("id").primaryKey(),
    applicationId: integer("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    scheduledAt: timestamp("scheduled_at").notNull(),
    durationMin: integer("duration_min").notNull().default(45),
    type: interviewTypeEnum("type").notNull().default("phone"),
    status: interviewStatusEnum("status").notNull().default("scheduled"),
    interviewerName: text("interviewer_name"),
    interviewerTitle: text("interviewer_title"),
    meetingUrl: text("meeting_url"),
    locationText: text("location_text"),
    prepNotesMd: text("prep_notes_md").notNull().default(""),
    postNotesMd: text("post_notes_md").notNull().default(""),
    reminderSentAt: timestamp("reminder_sent_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    byAppIdx: index("interviews_app_idx").on(t.applicationId),
    byScheduledIdx: index("interviews_scheduled_idx").on(t.scheduledAt),
  }),
);

export const interviewFeedback = pgTable("interview_feedback", {
  id: serial("id").primaryKey(),
  applicationId: integer("application_id")
    .notNull()
    .references(() => applications.id, { onDelete: "cascade" }),
  interviewId: integer("interview_id").references(() => interviews.id, { onDelete: "set null" }),
  source: feedbackSourceEnum("source").notNull().default("self"),
  rejectionCategory: rejectionCategoryEnum("rejection_category"),
  rating: integer("rating"),
  whatWentWellMd: text("what_went_well_md").notNull().default(""),
  whatWentBadlyMd: text("what_went_badly_md").notNull().default(""),
  whatToChangeMd: text("what_to_change_md").notNull().default(""),
  recruiterVerbatim: text("recruiter_verbatim"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const coverLetterTemplates = pgTable("cover_letter_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  bodyMd: text("body_md").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const coverLetters = pgTable("cover_letters", {
  id: serial("id").primaryKey(),
  applicationId: integer("application_id")
    .notNull()
    .references(() => applications.id, { onDelete: "cascade" }),
  templateId: integer("template_id").references(() => coverLetterTemplates.id, {
    onDelete: "set null",
  }),
  provider: providerEnum("provider").notNull(),
  generatedMd: text("generated_md").notNull(),
  pdfPath: text("pdf_path"),
  theme: text("theme").notNull().default("modern"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const flashcards = pgTable(
  "flashcards",
  {
    id: serial("id").primaryKey(),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobListings.id, { onDelete: "cascade" }),
    category: flashcardCategoryEnum("category").notNull(),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    provider: providerEnum("provider").notNull(),
    orderIdx: integer("order_idx").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    byJobIdx: index("flashcards_job_idx").on(t.jobId),
  }),
);

export const canonicalGaps = pgTable(
  "canonical_gaps",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    normalizedKey: text("normalized_key").notNull(),
    description: text("description").notNull().default(""),
    learningStatus: learningStatusEnum("learning_status").notNull().default("to_learn"),
    occurrences: integer("occurrences").notNull().default(0),
    lastClusteredAt: timestamp("last_clustered_at").defaultNow().notNull(),
    resourcesFetchedAt: timestamp("resources_fetched_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqKey: uniqueIndex("canonical_gaps_normalized_key_idx").on(t.normalizedKey),
  }),
);

export const canonicalGapSources = pgTable(
  "canonical_gap_sources",
  {
    id: serial("id").primaryKey(),
    canonicalGapId: integer("canonical_gap_id")
      .notNull()
      .references(() => canonicalGaps.id, { onDelete: "cascade" }),
    matchId: integer("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    rawPhrase: text("raw_phrase").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    uniq: uniqueIndex("canonical_gap_sources_uniq_idx").on(
      t.canonicalGapId,
      t.matchId,
      t.rawPhrase,
    ),
    byGap: index("canonical_gap_sources_gap_idx").on(t.canonicalGapId),
  }),
);

export const canonicalGapResources = pgTable(
  "canonical_gap_resources",
  {
    id: serial("id").primaryKey(),
    canonicalGapId: integer("canonical_gap_id")
      .notNull()
      .references(() => canonicalGaps.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    url: text("url").notNull(),
    kind: text("kind").notNull(),
    rationale: text("rationale").notNull().default(""),
    orderIdx: integer("order_idx").notNull().default(0),
    provider: providerEnum("provider").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    byGap: index("canonical_gap_resources_gap_idx").on(t.canonicalGapId),
  }),
);

export type Profile = typeof profile.$inferSelect;
export type CvMaster = typeof cvMaster.$inferSelect;
export type JobListing = typeof jobListings.$inferSelect;
export type Match = typeof matches.$inferSelect;
export type CvVariant = typeof cvVariants.$inferSelect;
export type Application = typeof applications.$inferSelect;
export type LinkedinScan = typeof linkedinScans.$inferSelect;
export type Interview = typeof interviews.$inferSelect;
export type InterviewFeedback = typeof interviewFeedback.$inferSelect;
export type CoverLetterTemplate = typeof coverLetterTemplates.$inferSelect;
export type CoverLetter = typeof coverLetters.$inferSelect;
export type Flashcard = typeof flashcards.$inferSelect;
export type CanonicalGap = typeof canonicalGaps.$inferSelect;
export type CanonicalGapSource = typeof canonicalGapSources.$inferSelect;
export type CanonicalGapResource = typeof canonicalGapResources.$inferSelect;
