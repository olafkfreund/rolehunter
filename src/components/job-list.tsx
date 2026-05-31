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

function isNew(job: JobListing): boolean {
  if (!job.fetchedAt) return false;
  return Date.now() - new Date(job.fetchedAt).getTime() < 24 * 60 * 60 * 1000;
}

function scoreClass(score: number | null | undefined): string {
  if (score == null) return "bg-[var(--muted)] text-[var(--muted-foreground)]";
  if (score >= 70) return "bg-red-500/15 text-red-300 border-red-500/30";
  if (score >= 50) return "bg-amber-500/15 text-amber-300 border-amber-500/30";
  return "bg-gray-500/15 text-gray-400 border-gray-500/30";
}

function scoreEmoji(score: number | null | undefined): string {
  if (score == null) return "❓";
  if (score >= 70) return "🔥";
  if (score >= 50) return "💪";
  return "😴";
}

type Sighting = {
  source?: string;
  externalId?: string;
  url?: string;
  fetchedAt?: string;
};

function extractSources(job: JobListing): string[] {
  const seen = job.sourcesSeen;
  if (Array.isArray(seen) && seen.length > 0) {
    const out: string[] = [];
    for (const s of seen as Sighting[]) {
      if (s.source && !out.includes(s.source)) out.push(s.source);
    }
    if (out.length > 0) return out;
  }
  return [job.source];
}

export function JobList({ jobs }: { jobs: JobListing[] }) {
  if (jobs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted-foreground)]">
        No jobs match this filter yet. Try a different band, or create a saved search.
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {jobs.map((job) => {
        const salary = formatSalary(job);
        const sources = extractSources(job);
        const newBadge = isNew(job);
        return (
          <li
            key={job.id}
            className="relative rounded-lg border border-[var(--border)] bg-[var(--background)] transition-colors hover:bg-[var(--muted)]/40"
          >
            <Link href={`/jobs/${job.id}`} className="block p-4">
              <div className="flex items-start gap-3">
                <div
                  className={`shrink-0 rounded-md border px-2 py-1 text-center font-mono text-sm ${scoreClass(
                    job.topScore,
                  )}`}
                  title={job.topScore != null ? `Match score ${job.topScore}/100` : "Unscored"}
                >
                  <div className="text-lg leading-none">{scoreEmoji(job.topScore)}</div>
                  <div className="mt-0.5 text-xs leading-none">
                    {job.topScore != null ? job.topScore : "—"}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-semibold">{job.title}</span>
                    {newBadge && (
                      <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-300">
                        NEW
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-sm text-[var(--muted-foreground)]">
                    {job.company || "Unknown company"}
                    {job.location ? ` · ${job.location}` : ""}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {sources.map((s) => (
                      <span
                        key={s}
                        className="rounded-full border border-[var(--border)] bg-[var(--muted)]/50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 pr-10 text-xs text-[var(--muted-foreground)]">
                    {job.postedAt && (
                      <span>Posted {new Date(job.postedAt).toLocaleDateString()}</span>
                    )}
                    {job.fetchedAt && (
                      <span>
                        Fetched {new Date(job.fetchedAt).toLocaleDateString()}{" "}
                        {new Date(job.fetchedAt).toLocaleTimeString()}
                      </span>
                    )}
                    {salary && <span>{salary}</span>}
                  </div>
                </div>
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
