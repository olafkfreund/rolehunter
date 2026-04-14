import Link from "next/link";
import type { JobListing } from "@/lib/db/schema";
import { TrackJobButton } from "@/components/track-job-button";

function formatSalary(job: JobListing): string | null {
  if (!job.salaryMin && !job.salaryMax) return null;
  const currency = job.salaryCurrency ?? "";
  const min = job.salaryMin ? job.salaryMin.toLocaleString() : null;
  const max = job.salaryMax ? job.salaryMax.toLocaleString() : null;
  const range = min && max ? `${min} – ${max}` : (min ?? max ?? "");
  return `${currency} ${range}`.trim();
}

export function JobList({ jobs }: { jobs: JobListing[] }) {
  if (jobs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted-foreground)]">
        No jobs yet. Paste a description or search JSearch above.
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {jobs.map((job) => {
        const salary = formatSalary(job);
        return (
          <li
            key={job.id}
            className="relative rounded-lg border border-[var(--border)] bg-[var(--background)] transition-colors hover:bg-[var(--muted)]/40"
          >
            <Link href={`/jobs/${job.id}`} className="block p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{job.title}</div>
                  <div className="mt-0.5 truncate text-sm text-[var(--muted-foreground)]">
                    {job.company || "Unknown company"}
                    {job.location ? ` · ${job.location}` : ""}
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full border border-[var(--border)] px-2 py-0.5 text-xs ${
                    job.source === "jsearch"
                      ? "bg-[var(--accent)]/10"
                      : "bg-[var(--muted)]"
                  }`}
                >
                  {job.source}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 pr-10 text-xs text-[var(--muted-foreground)]">
                {job.postedAt && (
                  <span>Posted {new Date(job.postedAt).toLocaleDateString()}</span>
                )}
                <span>Cached {new Date(job.cachedAt).toLocaleString()}</span>
                {salary && <span>{salary}</span>}
              </div>
            </Link>
            <div className="absolute right-3 bottom-3">
              <TrackJobButton jobId={job.id} variant="icon" />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
