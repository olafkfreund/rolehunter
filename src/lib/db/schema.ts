import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  smallint,
  numeric,
  date,
  jsonb,
  pgEnum,
  varchar,
  index,
  uniqueIndex,
  boolean,
  doublePrecision,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const jobSourceEnum = pgEnum("job_source", [
  "paste",
  "jsearch",
  "linkedin",
  "adzuna",
  "indeed",
  "dice",
  "jobspy",
  "apify",
  "greenhouse",
  "lever",
  "workday",
]);
export const providerEnum = pgEnum("llm_provider", ["claude", "gemini", "openai", "ollama"]);
export const profileFrequencyEnum = pgEnum("profile_frequency", [
  "hourly",
  "every_4h",
  "daily",
  "weekly",
]);
export const searchRunStatusEnum = pgEnum("search_run_status", [
  "running",
  "success",
  "failed",
  "partial",
  "skipped_budget",
]);
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
  // v3.2 — full home address for commute calculations (#43 slice 1)
  // Geocoded via OpenStreetMap Nominatim on save (free, no key).
  homeAddress: text("home_address"),
  homeLat: doublePrecision("home_lat"),
  homeLng: doublePrecision("home_lng"),
  homeGeocodedAt: timestamp("home_geocoded_at"),
  // v3.2 — target compensation band (#43 follow-up to slice 6 fit dashboard)
  // Used to score the Compensation dimension of the role-fit dashboard
  // against the JD's posted salary band.
  salaryTargetMin: integer("salary_target_min"),
  salaryTargetMax: integer("salary_target_max"),
  salaryTargetCurrency: varchar("salary_target_currency", { length: 8 }),
  salaryTargetPeriod: varchar("salary_target_period", { length: 16 }), // annual|monthly|daily|hourly
  // v3.2 — culture preferences (#43 follow-up). Profile-driven so the role-fit
  // dashboard's Culture dimension scores against what the user actually wants.
  // `workModePreference` ∈ {remote, hybrid, onsite, any}; "any" = no penalty.
  // `cultureLikes` / `cultureAvoids` are arrays of keyword keys from the
  // CULTURE_KEYWORDS vocabulary in src/lib/jobs/fit-score.ts.
  workModePreference: varchar("work_mode_preference", { length: 16 }),
  maxOfficeDaysPerWeek: smallint("max_office_days_per_week"),
  cultureLikes: jsonb("culture_likes").notNull().default([]),
  cultureAvoids: jsonb("culture_avoids").notNull().default([]),
  // v3.2 — company / commute prefs (#43 /settings/company-prefs slice)
  maxCommuteMinutes: smallint("max_commute_minutes"),
  preferredTransportMode: varchar("preferred_transport_mode", { length: 16 }), // car|transit|bike|walk|any
  benefitPriorities: jsonb("benefit_priorities").notNull().default([]),
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
    // v3.0 additions
    dedupeHash: text("dedupe_hash"),
    sourcesSeen: jsonb("sources_seen").notNull().default([]),
    fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
    topScore: smallint("top_score"),
    searchProfileId: integer("search_profile_id").references(
      (): any => searchProfiles.id,
      { onDelete: "set null" },
    ),
    // v3.2 — companies (epic #43 slice 1)
    // Nullable: backfilled lazily on first "Should you work here?" click per job.
    companyId: integer("company_id").references((): any => companies.id, {
      onDelete: "set null",
    }),
    // v3.2 — cached role-fit overall score (0-100)
    // Computed by computeFitReport() on /jobs/[id] view; stamped here so the
    // /jobs list can show it without recomputing per row.
    fitOverallScore: smallint("fit_overall_score"),
    fitScoredAt: timestamp("fit_scored_at"),
  },
  (t) => ({
    externalIdx: uniqueIndex("job_listings_external_idx").on(t.source, t.externalId),
    titleIdx: index("job_listings_title_idx").on(t.title),
    // v3.0 additions
    feedIdx: index("job_listings_feed_idx").on(t.topScore.desc(), t.fetchedAt.desc()),
    dedupeIdx: index("job_listings_dedupe_idx").on(t.dedupeHash),
    fetchedIdx: index("job_listings_fetched_idx").on(t.fetchedAt.desc()),
    profileIdx: index("job_listings_profile_idx").on(t.searchProfileId),
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

// ─── v3.0: multi-source aggregation ────────────────────────────────────────

export const searchProfiles = pgTable(
  "search_profiles",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    query: text("query").notNull(),
    location: varchar("location", { length: 200 }),
    locationRadiusKm: integer("location_radius_km"),
    salaryMinUsd: integer("salary_min_usd"),
    salaryMaxUsd: integer("salary_max_usd"),
    salaryCurrency: varchar("salary_currency", { length: 8 }).default("USD"),
    remoteModes: jsonb("remote_modes").notNull().default([]),
    experienceLevels: jsonb("experience_levels").notNull().default([]),
    jobTypes: jsonb("job_types").notNull().default([]),
    sources: jsonb("sources").notNull(),
    /**
     * Per-profile company list for ATS-direct adapters (greenhouse / lever / workday).
     * Format depends on the source: company slug for Greenhouse/Lever, "tenant/site"
     * for Workday. Ignored by query-based adapters (jsearch, linkedin, adzuna, etc).
     */
    companies: jsonb("companies").notNull().default([]),
    frequency: profileFrequencyEnum("frequency").notNull().default("daily"),
    maxResultsPerRun: integer("max_results_per_run").notNull().default(50),
    active: boolean("active").notNull().default(true),
    nextRunAt: timestamp("next_run_at").defaultNow().notNull(),
    lastRunAt: timestamp("last_run_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    dueIdx: index("search_profiles_due_idx").on(t.active, t.nextRunAt),
  }),
);

export const searchRuns = pgTable(
  "search_runs",
  {
    id: serial("id").primaryKey(),
    profileId: integer("profile_id")
      .notNull()
      .references(() => searchProfiles.id, { onDelete: "cascade" }),
    source: jobSourceEnum("source").notNull(),
    status: searchRunStatusEnum("status").notNull().default("running"),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    finishedAt: timestamp("finished_at"),
    durationMs: integer("duration_ms"),
    jobsFound: integer("jobs_found").notNull().default(0),
    jobsNew: integer("jobs_new").notNull().default(0),
    jobsDuplicate: integer("jobs_duplicate").notNull().default(0),
    jobsFailedScore: integer("jobs_failed_score").notNull().default(0),
    costUsdEstimate: numeric("cost_usd_estimate", { precision: 10, scale: 4 }),
    errorMessage: text("error_message"),
  },
  (t) => ({
    byProfileIdx: index("search_runs_profile_idx").on(t.profileId, t.startedAt.desc()),
    byStatusIdx: index("search_runs_status_idx").on(t.status),
  }),
);

export const sourceBudgets = pgTable(
  "source_budgets",
  {
    id: serial("id").primaryKey(),
    // text not enum: 'auto_score' is a synthetic budget source not in job_source
    source: text("source").notNull(),
    monthYear: varchar("month_year", { length: 7 }).notNull(),
    usageCount: integer("usage_count").notNull().default(0),
    estimatedSpendUsd: numeric("estimated_spend_usd", { precision: 10, scale: 4 })
      .notNull()
      .default("0"),
    monthlyCapUsd: numeric("monthly_cap_usd", { precision: 10, scale: 4 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqByMonth: uniqueIndex("source_budgets_uniq_month_idx").on(t.source, t.monthYear),
  }),
);

export const sourceQuotasDaily = pgTable(
  "source_quotas_daily",
  {
    id: serial("id").primaryKey(),
    source: jobSourceEnum("source").notNull(),
    day: date("day").notNull(),
    usageCount: integer("usage_count").notNull().default(0),
    dailyCap: integer("daily_cap").notNull(),
  },
  (t) => ({
    uniqByDay: uniqueIndex("source_quotas_daily_uniq_idx").on(t.source, t.day),
  }),
);

export type SearchProfile = typeof searchProfiles.$inferSelect;
export type SearchRun = typeof searchRuns.$inferSelect;
export type SourceBudget = typeof sourceBudgets.$inferSelect;
export type SourceQuotaDaily = typeof sourceQuotasDaily.$inferSelect;

// ─── v3.1: portfolio knowledge graph ───────────────────────────────────────

export const portfolioKindEnum = pgEnum("portfolio_kind", [
  "github_repo",
  "gitlab_repo",
  "blog_post",
  "website",
  "obsidian_note",
  "manual_project",
  "manual_skill",
  "manual_role",
]);

export const portfolioItems = pgTable(
  "portfolio_items",
  {
    id: serial("id").primaryKey(),
    kind: portfolioKindEnum("kind").notNull(),
    /**
     * Logical source key, e.g. "github:olafkfreund" or "gitlab:some-user".
     * Combined with externalId to form the dedupe key for re-syncs.
     */
    sourceKey: text("source_key").notNull(),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    url: text("url"),
    tech: jsonb("tech").notNull().default([]),
    highlights: jsonb("highlights").notNull().default([]),
    role: text("role"),
    startedAt: timestamp("started_at"),
    endedAt: timestamp("ended_at"),
    stars: integer("stars"),
    /** User-toggled visibility for matching. */
    hidden: boolean("hidden").notNull().default(false),
    rawJson: jsonb("raw_json"),
    syncedAt: timestamp("synced_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    uniq: uniqueIndex("portfolio_items_uniq_idx").on(t.sourceKey, t.externalId),
    byKind: index("portfolio_items_kind_idx").on(t.kind),
    bySynced: index("portfolio_items_synced_idx").on(t.syncedAt.desc()),
  }),
);

export type PortfolioItem = typeof portfolioItems.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────
// v3.2 — Companies (epic #43 slice 1)
//
// Canonical per-company record. Job listings reference it by FK so multiple
// jobs at the same employer share one cached enrichment record. Slice 1
// populates the row from zero-cost sources (Wikidata, Layoffs.fyi, Clearbit
// logo URL). Paid sources (Glassdoor / Levels.fyi / Crunchbase / Google Maps)
// land in later slices and just add columns / sibling tables.

export const companies = pgTable(
  "companies",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    website: text("website"),
    headquarters: text("headquarters"),
    hqLat: doublePrecision("hq_lat"),
    hqLng: doublePrecision("hq_lng"),
    hqGeocodedAt: timestamp("hq_geocoded_at"),
    foundedYear: integer("founded_year"),
    summary: text("summary").notNull().default(""),
    logoUrl: text("logo_url"),
    wikidataId: text("wikidata_id"),
    linkedinUrl: text("linkedin_url"),
    glassdoorUrl: text("glassdoor_url"),
    // Glassdoor enrichment (v3.2 slice 3 — populated via Apify)
    glassdoorRating: numeric("glassdoor_rating", { precision: 3, scale: 2 }),
    glassdoorReviewCount: integer("glassdoor_review_count"),
    glassdoorRecommendPct: smallint("glassdoor_recommend_pct"),
    glassdoorCeoApprovalPct: smallint("glassdoor_ceo_approval_pct"),
    glassdoorTopPro: text("glassdoor_top_pro"),
    glassdoorTopCon: text("glassdoor_top_con"),
    glassdoorSyncedAt: timestamp("glassdoor_synced_at"),
    // Layoffs.fyi flags
    hasRecentLayoff: boolean("has_recent_layoff").notNull().default(false),
    lastLayoffAt: timestamp("last_layoff_at"),
    lastLayoffCount: integer("last_layoff_count"),
    // Cache control: any source can stamp this when it last refreshed
    enrichmentSyncedAt: timestamp("enrichment_synced_at"),
    rawJson: jsonb("raw_json"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqSlug: uniqueIndex("companies_slug_idx").on(t.slug),
  }),
);

export type Company = typeof companies.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────
// v3.2 — Company sibling tables (#43 final-stretch)
//
// Each holds per-source enrichment data referencing the canonical company.
// Adapters land in src/lib/companies/sources/ and write to these tables on
// enrich. All tables have ON DELETE CASCADE so removing a company tidies up.

export const companyOffices = pgTable(
  "company_offices",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references((): any => companies.id, { onDelete: "cascade" }),
    label: text("label").notNull().default(""), // "HQ", "London office", ...
    address: text("address"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    amenities: jsonb("amenities").notNull().default([]), // ["gym","parking",...]
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    byCompany: index("company_offices_company_idx").on(t.companyId),
  }),
);
export type CompanyOffice = typeof companyOffices.$inferSelect;

export const companyReviewSourceEnum = pgEnum("company_review_source", [
  "glassdoor",
  "blind",
  "fishbowl",
  "other",
]);

export const companyReviews = pgTable(
  "company_reviews",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references((): any => companies.id, { onDelete: "cascade" }),
    source: companyReviewSourceEnum("source").notNull(),
    title: text("title"),
    body: text("body").notNull().default(""),
    rating: numeric("rating", { precision: 3, scale: 2 }),
    pros: text("pros"),
    cons: text("cons"),
    role: text("role"),
    postedAt: timestamp("posted_at"),
    rawJson: jsonb("raw_json"),
    fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
  },
  (t) => ({
    byCompany: index("company_reviews_company_idx").on(t.companyId),
    bySource: index("company_reviews_source_idx").on(t.source),
  }),
);
export type CompanyReview = typeof companyReviews.$inferSelect;

export const companyBenefits = pgTable(
  "company_benefits",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references((): any => companies.id, { onDelete: "cascade" }),
    category: varchar("category", { length: 64 }).notNull(), // "401k"|"pto"|"parental"|"health"|"equity"|"stipend"|"other"
    description: text("description").notNull(),
    valueText: text("value_text"), // free-form: "5% match", "20 days", "$1000/yr"
    source: varchar("source", { length: 64 }), // "glassdoor"|"levels.fyi"|"manual"
    rawJson: jsonb("raw_json"),
    fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
  },
  (t) => ({
    byCompany: index("company_benefits_company_idx").on(t.companyId),
  }),
);
export type CompanyBenefit = typeof companyBenefits.$inferSelect;

export const companyNewsKindEnum = pgEnum("company_news_kind", [
  "news",
  "funding",
  "acquisition",
  "ipo",
  "leadership",
  "press_release",
]);

export const companyNews = pgTable(
  "company_news",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references((): any => companies.id, { onDelete: "cascade" }),
    kind: companyNewsKindEnum("kind").notNull().default("news"),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    url: text("url"),
    source: varchar("source", { length: 64 }), // "google-news-rss"|"crunchbase"|"tavily"|"manual"
    publishedAt: timestamp("published_at"),
    rawJson: jsonb("raw_json"),
    fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
  },
  (t) => ({
    byCompany: index("company_news_company_idx").on(t.companyId),
    byPublished: index("company_news_published_idx").on(t.publishedAt.desc()),
  }),
);
export type CompanyNewsItem = typeof companyNews.$inferSelect;

export const companyLayoffs = pgTable(
  "company_layoffs",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references((): any => companies.id, { onDelete: "cascade" }),
    affectedCount: integer("affected_count"),
    percentOfWorkforce: numeric("percent_of_workforce", { precision: 5, scale: 2 }),
    announcedAt: timestamp("announced_at").notNull(),
    sourceUrl: text("source_url"),
    summary: text("summary").notNull().default(""),
    rawJson: jsonb("raw_json"),
    fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
  },
  (t) => ({
    byCompany: index("company_layoffs_company_idx").on(t.companyId),
    byAnnounced: index("company_layoffs_announced_idx").on(t.announcedAt.desc()),
  }),
);
export type CompanyLayoff = typeof companyLayoffs.$inferSelect;

export const companyConnectionKindEnum = pgEnum("company_connection_kind", [
  "current_employee",
  "alumni",
  "school_alumni",
  "mutual_connection",
]);

export const companyConnections = pgTable(
  "company_connections",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references((): any => companies.id, { onDelete: "cascade" }),
    kind: companyConnectionKindEnum("kind").notNull(),
    name: text("name").notNull().default(""),
    headline: text("headline"),
    linkedinUrl: text("linkedin_url"),
    sharedSchool: text("shared_school"),
    rawJson: jsonb("raw_json"),
    fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
  },
  (t) => ({
    byCompany: index("company_connections_company_idx").on(t.companyId),
  }),
);
export type CompanyConnection = typeof companyConnections.$inferSelect;

// Cached fit-score per company (computed from sibling-table signals).
// Refreshed when a company is enriched or a sibling row changes.
export const companyFitScores = pgTable(
  "company_fit_scores",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references((): any => companies.id, { onDelete: "cascade" })
      .unique(),
    score: smallint("score").notNull(), // 0-100
    breakdownJson: jsonb("breakdown_json").notNull(),
    computedAt: timestamp("computed_at").defaultNow().notNull(),
  },
);
export type CompanyFitScore = typeof companyFitScores.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────
// v3.2 slice 4 — app_settings (#43 + user request 2026-05-31)
//
// Key/value store for runtime-editable settings so the Docker image ships
// without needing .env edits. Values can be set via the /settings UI or via
// the first-run wizard at /welcome. Reads fall back to process.env when no
// row exists, so existing .env-based deployments keep working.

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  isSecret: boolean("is_secret").notNull().default(false),
  description: text("description"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type AppSetting = typeof appSettings.$inferSelect;
