// Application-side comparison: assemble side-by-side metrics for every
// active application's company versus a baseline (the current /companies/[id]).
// Pure read-only — used by the "compare to applications" panel.

import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { Company, CompanyFitScore } from "@/lib/db/schema";
import { getProfile } from "@/lib/repo/profile";
import { resolveDistanceKm } from "./work-location";

export interface CompareRow {
  applicationId: number;
  jobId: number;
  jobTitle: string;
  stage: string;
  company: Company;
  fitScore: number | null;
  distanceKm: number | null;
}

/**
 * Returns one CompareRow per non-rejected application whose job has a
 * companyId. Skips rejected/withdrawn so the comparison shows only the
 * roles the user is genuinely weighing.
 */
export async function listApplicationCompanies(): Promise<CompareRow[]> {
  const db = getDb();
  const profile = await getProfile();

  // Pull active applications with their job + company FK in one shot.
  const rows = await db
    .select({
      applicationId: schema.applications.id,
      jobId: schema.applications.jobId,
      jobTitle: schema.jobListings.title,
      stage: schema.applications.stage,
      companyId: schema.jobListings.companyId,
    })
    .from(schema.applications)
    .innerJoin(
      schema.jobListings,
      eq(schema.applications.jobId, schema.jobListings.id),
    )
    .where(/* skip rejected so users compare only live considerations */
      eq(schema.applications.stage, "applied"),
    );

  // We also want saved / phone / onsite / offer; rewrite with inArray.
  // The above filter is intentionally tight; broaden with a second pass.
  const broad = await db
    .select({
      applicationId: schema.applications.id,
      jobId: schema.applications.jobId,
      jobTitle: schema.jobListings.title,
      stage: schema.applications.stage,
      companyId: schema.jobListings.companyId,
    })
    .from(schema.applications)
    .innerJoin(
      schema.jobListings,
      eq(schema.applications.jobId, schema.jobListings.id),
    )
    .where(
      inArray(schema.applications.stage, ["saved", "applied", "phone", "onsite", "offer"]),
    );

  const withCompany = broad.filter(
    (r): r is typeof r & { companyId: number } => r.companyId !== null,
  );
  if (withCompany.length === 0) return [];

  const companyIds = Array.from(new Set(withCompany.map((r) => r.companyId)));
  const companies = await db
    .select()
    .from(schema.companies)
    .where(inArray(schema.companies.id, companyIds));
  const fitRows = await db
    .select()
    .from(schema.companyFitScores)
    .where(inArray(schema.companyFitScores.companyId, companyIds));

  const companyMap = new Map(companies.map((c) => [c.id, c]));
  const fitMap = new Map<number, CompanyFitScore>();
  for (const f of fitRows) fitMap.set(f.companyId, f);

  // flatMap can't await, so resolve distances in parallel up front
  const withDistance = await Promise.all(
    withCompany.map(async (r) => {
      const company = companyMap.get(r.companyId);
      if (!company) return null;
      const d = await resolveDistanceKm(company, profile);
      return { r, company, distanceKm: d?.km ?? null };
    }),
  );

  return withDistance.flatMap((entry) => {
    if (!entry) return [];
    const { r, company, distanceKm } = entry;
    return [
      {
        applicationId: r.applicationId,
        jobId: r.jobId,
        jobTitle: r.jobTitle,
        stage: r.stage as string,
        company,
        fitScore: fitMap.get(company.id)?.score ?? null,
        distanceKm,
      },
    ];
  });
}
