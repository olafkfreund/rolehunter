// Bulk destructive operations for the /settings Danger Zone.
//
// Each function is irreversible. Callers MUST pass a confirmation phrase
// that exactly matches the expected value (constants exported below); the
// wrapper API route enforces that. Single-user self-hosted threat model:
// the confirmation is to protect against accidental clicks, not malicious
// input.

import { and, eq, ilike, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

export const CONFIRM_PHRASES = {
  jobs_in_zone: "DELETE JOBS IN ZONE",
  hidden_jobs: "DELETE HIDDEN JOBS",
  all_jobs: "DELETE ALL JOBS",
  all_portfolio: "DELETE ALL PORTFOLIO",
  all_applications: "DELETE ALL APPLICATIONS",
  all_companies: "DELETE ALL COMPANIES",
  full_reset: "RESET EVERYTHING",
} as const;

export type DangerAction = keyof typeof CONFIRM_PHRASES;

/**
 * Hard-delete every job whose location contains the given substring
 * (case-insensitive). Use ", US" or "United States" to wipe a country,
 * or "London" for a city. Returns the number of rows removed.
 */
export async function deleteJobsByLocationSubstring(needle: string): Promise<number> {
  if (!needle.trim()) return 0;
  const db = getDb();
  const deleted = await db
    .delete(schema.jobListings)
    .where(ilike(schema.jobListings.location, `%${needle.trim()}%`))
    .returning({ id: schema.jobListings.id });
  return deleted.length;
}

/** Hard-delete every hidden job. */
export async function deleteHiddenJobs(): Promise<number> {
  const db = getDb();
  const deleted = await db
    .delete(schema.jobListings)
    .where(eq(schema.jobListings.hidden, true))
    .returning({ id: schema.jobListings.id });
  return deleted.length;
}

/** Hard-delete every job listing. Cascades to matches / applications. */
export async function deleteAllJobs(): Promise<number> {
  const db = getDb();
  const deleted = await db
    .delete(schema.jobListings)
    .returning({ id: schema.jobListings.id });
  return deleted.length;
}

/** Wipe every portfolio item. */
export async function deleteAllPortfolio(): Promise<number> {
  const db = getDb();
  const deleted = await db
    .delete(schema.portfolioItems)
    .returning({ id: schema.portfolioItems.id });
  return deleted.length;
}

/** Wipe every application + its variants. Jobs remain. */
export async function deleteAllApplications(): Promise<number> {
  const db = getDb();
  const deleted = await db
    .delete(schema.applications)
    .returning({ id: schema.applications.id });
  return deleted.length;
}

/** Wipe every company. Cascades: company_offices, news, layoffs, etc. */
export async function deleteAllCompanies(): Promise<number> {
  const db = getDb();
  const deleted = await db
    .delete(schema.companies)
    .returning({ id: schema.companies.id });
  return deleted.length;
}

/**
 * Full reset: wipe every user-data table EXCEPT the profile row (we keep
 * the row but blank its fields). Returns a per-table count.
 */
export async function fullReset(): Promise<Record<string, number>> {
  const db = getDb();
  const out: Record<string, number> = {};

  out.applications = (
    await db.delete(schema.applications).returning({ id: schema.applications.id })
  ).length;
  out.interviews = (
    await db.delete(schema.interviews).returning({ id: schema.interviews.id })
  ).length;
  out.matches = (
    await db.delete(schema.matches).returning({ id: schema.matches.id })
  ).length;
  out.cvVariants = (
    await db.delete(schema.cvVariants).returning({ id: schema.cvVariants.id })
  ).length;
  out.jobs = (
    await db.delete(schema.jobListings).returning({ id: schema.jobListings.id })
  ).length;
  out.portfolio = (
    await db.delete(schema.portfolioItems).returning({ id: schema.portfolioItems.id })
  ).length;
  out.companies = (
    await db.delete(schema.companies).returning({ id: schema.companies.id })
  ).length;
  out.searchProfiles = (
    await db.delete(schema.searchProfiles).returning({ id: schema.searchProfiles.id })
  ).length;
  out.cvMaster = (
    await db.delete(schema.cvMaster).returning({ id: schema.cvMaster.id })
  ).length;

  // Blank profile fields (keep id=1). Forward-compat fields added by
  // not-yet-merged PRs are blanked with a JSON merge so this still works
  // when those columns exist; harmless when they don't.
  await db.execute(sql`
    UPDATE profile SET
      full_name = '',
      email = '',
      phone = '',
      location = '',
      summary = '',
      avatar_path = NULL,
      linkedin_url = NULL,
      linkedin_headline = NULL,
      linkedin_about = NULL,
      home_address = NULL,
      home_lat = NULL,
      home_lng = NULL,
      home_geocoded_at = NULL,
      salary_target_min = NULL,
      salary_target_max = NULL,
      salary_target_currency = NULL,
      salary_target_period = NULL,
      work_mode_preference = NULL,
      max_office_days_per_week = NULL,
      culture_likes = '[]'::jsonb,
      culture_avoids = '[]'::jsonb,
      max_commute_minutes = NULL,
      preferred_transport_mode = NULL,
      benefit_priorities = '[]'::jsonb,
      updated_at = NOW()
    WHERE id = 1
  `);

  return out;
}

// Keep `and` import live for future selective queries.
void and;
