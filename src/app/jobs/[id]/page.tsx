import Link from "next/link";
import { notFound } from "next/navigation";
import { getJob, updateJobDescription } from "@/lib/repo/jobs";
import { getJobDetail } from "@/lib/linkedin/client";
import { listApplicationsWithJob } from "@/lib/repo/applications";
import { getCompanyForJob } from "@/lib/repo/companies";
import { getProfile } from "@/lib/repo/profile";
import { getActiveCv } from "@/lib/repo/cv";
import { haversineKm } from "@/lib/companies/geo";
import { computeFitReport } from "@/lib/jobs/fit-score";
import type { JobListing, CvMaster } from "@/lib/db/schema";
import type { CvJson } from "@/lib/llm";
import { MatchPanel } from "@/components/match-panel";
import { CvRewritePanel } from "@/components/cv-rewrite-panel";
import { InterviewsPanel } from "@/components/interviews-panel";
import { CoverLetterPanel } from "@/components/cover-letter-panel";
import { FlashcardsPanel } from "@/components/flashcards-panel";
import { JobActionBar } from "@/components/job-action-bar";
import { CompanyPanel } from "@/components/company-panel";
import { FitDashboard } from "@/components/fit-dashboard";

export const dynamic = "force-dynamic";

function formatSalary(job: JobListing): string | null {
  if (!job.salaryMin && !job.salaryMax) return null;
  const currency = job.salaryCurrency ?? "";
  const min = job.salaryMin ? job.salaryMin.toLocaleString() : null;
  const max = job.salaryMax ? job.salaryMax.toLocaleString() : null;
  const range = min && max ? `${min} – ${max}` : (min ?? max ?? "");
  return `${currency} ${range}`.trim();
}

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId) || !Number.isInteger(numericId) || numericId <= 0) {
    notFound();
  }
  let job = await getJob(numericId);
  if (!job) notFound();

  // Lazy fetch description for LinkedIn jobs on first view
  if (job.source === "linkedin" && (!job.description || job.description.trim() === "")) {
    if (job.externalId) {
      try {
        const detail = await getJobDetail(job.externalId);
        if (detail.description?.trim()) {
          await updateJobDescription(job.id, detail.description);
          job = { ...job, description: detail.description };
        }
      } catch (e) {
        console.warn("[jobs/:id] lazy detail fetch failed", e);
        // Fall through — page still renders, just with empty description.
      }
    }
  }

  const salary = formatSalary(job);

  const applications = await listApplicationsWithJob();
  const application = applications.find((a) => a.jobId === job.id) ?? null;
  const applicationId: number | null = application?.id ?? null;

  // v3.2 — company panel data + fit dashboard inputs
  const [company, profileForGeo, activeCv] = await Promise.all([
    getCompanyForJob(job.id),
    getProfile(),
    getActiveCv(),
  ]);
  const profileHasHomeAddress = !!profileForGeo.homeLat && !!profileForGeo.homeLng;
  let initialDistanceKm: number | null = null;
  if (
    company?.hqLat != null &&
    company?.hqLng != null &&
    profileForGeo.homeLat != null &&
    profileForGeo.homeLng != null
  ) {
    initialDistanceKm = haversineKm(
      {
        lat: profileForGeo.homeLat,
        lng: profileForGeo.homeLng,
        displayName: "",
      },
      { lat: company.hqLat, lng: company.hqLng, displayName: "" },
    );
  }

  return (
    <div className="space-y-6">
      <nav className="text-sm">
        <Link href="/jobs" className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
          ← Back to jobs
        </Link>
      </nav>

      <JobActionBar jobId={job.id} applicationId={applicationId} />

      <header className="space-y-2">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">{job.title}</h1>
            <div className="text-sm text-[var(--muted-foreground)]">
              {company ? (
                <Link
                  href={`/companies/${company.id}`}
                  className="hover:text-[var(--foreground)] hover:underline underline-offset-2"
                >
                  {job.company}
                </Link>
              ) : (
                job.company || "Unknown company"
              )}
              {job.location ? ` · ${job.location}` : ""}
            </div>
          </div>
          <span className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--muted)] px-2 py-0.5 text-xs">
            {job.source}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--muted-foreground)]">
          {job.postedAt && (
            <span>Posted {new Date(job.postedAt).toLocaleDateString()}</span>
          )}
          <span>Cached {new Date(job.cachedAt).toLocaleString()}</span>
          {salary && <span>{salary}</span>}
          {job.url && (
            <a
              href={job.url}
              target="_blank"
              rel="noreferrer"
              className="text-[var(--accent)] underline hover:opacity-80"
            >
              Apply / view original ↗
            </a>
          )}
        </div>
      </header>

      <FitDashboard
        report={computeFitReport(
          job,
          (activeCv?.parsedJson ?? null) as CvJson | null,
          company,
          profileForGeo,
        )}
      />

      <CompanyPanel
        jobId={job.id}
        initialCompany={company}
        initialDistanceKm={initialDistanceKm}
        profileHasHomeAddress={profileHasHomeAddress}
      />

      <MatchPanel jobId={job.id} />

      <CvRewritePanel jobId={job.id} />

      <section className="space-y-2 rounded-lg border border-[var(--border)] p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
          Interviews
        </h2>
        {applicationId !== null ? (
          <InterviewsPanel applicationId={applicationId} />
        ) : (
          <p className="text-sm text-[var(--muted-foreground)]">
            <Link href="/kanban" className="text-[var(--accent)] underline hover:opacity-80">
              Track this job on the Kanban
            </Link>{" "}
            to start scheduling interviews.
          </p>
        )}
      </section>

      <section className="space-y-2 rounded-lg border border-[var(--border)] p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
          Cover letter
        </h2>
        <CoverLetterPanel jobId={job.id} />
      </section>

      <section className="space-y-2 rounded-lg border border-[var(--border)] p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
          Flashcards
        </h2>
        <FlashcardsPanel jobId={job.id} />
      </section>

      <section className="space-y-2 rounded-lg border border-[var(--border)] p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
          Description
        </h2>
        <div className="whitespace-pre-wrap text-sm leading-relaxed">
          {job.description || "(no description)"}
        </div>
      </section>
    </div>
  );
}
