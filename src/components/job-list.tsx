import Link from "next/link";
import type { JobListing } from "@/lib/db/schema";
import { TrackJobButton } from "@/components/track-job-button";

function formatSalary(job: JobListing): string | null {
  if (!job.salaryMin && !job.salaryMax) return null;
  const currency = job.salaryCurrency ?? "";
  const min = job.salaryMin ? job.salaryMin.toLocaleString() : null;
  const max = job.salaryMax ? job.salaryMax.toLocaleString() : null;
  const range = min && max ? `${min}–${max}` : (min ?? max ?? "");
  return `${currency} ${range}`.trim();
}

function isNew(job: JobListing): boolean {
  if (!job.fetchedAt) return false;
  return Date.now() - new Date(job.fetchedAt).getTime() < 24 * 60 * 60 * 1000;
}

function scoreBand(score: number | null | undefined): "top" | "stretch" | "pass" | "none" {
  if (score == null) return "none";
  if (score >= 70) return "top";
  if (score >= 50) return "stretch";
  return "pass";
}

function bandLabel(band: ReturnType<typeof scoreBand>): string {
  switch (band) {
    case "top": return "top";
    case "stretch": return "stretch";
    case "pass": return "pass";
    case "none": return "—";
  }
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

function timeAgo(iso: Date | string | null | undefined): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  if (diff < 30 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d`;
  return `${Math.floor(diff / (30 * 86_400_000))}mo`;
}

export function JobList({ jobs }: { jobs: JobListing[] }) {
  if (jobs.length === 0) {
    return (
      <div className="card p-12 text-center">
        <div className="section-label mb-2">empty set</div>
        <div className="text-[var(--fg-3)] text-sm">
          No jobs match this filter. Try a different band, or{" "}
          <Link href="/search" className="text-[var(--accent)] hover:underline">
            create a saved search
          </Link>
          .
        </div>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-md overflow-hidden bg-[var(--bg-elev)]">
      {jobs.map((job) => {
        const salary = formatSalary(job);
        const sources = extractSources(job);
        const newBadge = isNew(job);
        const band = scoreBand(job.topScore);
        const fitBand = scoreBand(job.fitOverallScore);

        return (
          <li
            key={job.id}
            className="row group relative transition-colors hover:bg-[var(--bg-elev-2)]"
          >
            <Link href={`/jobs/${job.id}`} className="flex items-start gap-4 px-4 py-3 pr-12">
              <div className="score-pill" data-band={band}>
                <span className="n">{job.topScore ?? "—"}</span>
                <span className="b">{bandLabel(band)}</span>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-[var(--fg)] font-medium text-[15px] tracking-tight">
                    {job.title}
                  </span>
                  {newBadge && <span className="ribbon-new">new</span>}
                </div>

                <div className="mt-0.5 text-[13px] text-[var(--fg-2)]">
                  {job.company || (
                    <span
                      className="italic text-[var(--fg-3)]"
                      style={{ fontFamily: "var(--font-serif)" }}
                    >
                      unknown company
                    </span>
                  )}
                  {job.location && (
                    <>
                      <span className="text-[var(--fg-4)] mx-1.5">/</span>
                      <span className="text-[var(--fg-3)]">{job.location}</span>
                    </>
                  )}
                </div>

                <div className="mt-2 flex items-center gap-x-2 gap-y-1 flex-wrap text-[11px]">
                  {job.fitOverallScore !== null && (
                    <span
                      className="chip"
                      title="Local role-fit overall (skills + experience + culture + comp + logistics). Updates when you open the role."
                      style={{
                        color:
                          fitBand === "top"
                            ? "var(--ok)"
                            : fitBand === "stretch"
                              ? "var(--warn)"
                              : fitBand === "pass"
                                ? "var(--danger)"
                                : "var(--fg-3)",
                        borderColor:
                          fitBand === "top"
                            ? "color-mix(in srgb, var(--ok) 40%, var(--border))"
                            : fitBand === "stretch"
                              ? "color-mix(in srgb, var(--warn) 40%, var(--border))"
                              : fitBand === "pass"
                                ? "color-mix(in srgb, var(--danger) 35%, var(--border))"
                                : "var(--border)",
                      }}
                    >
                      <span className="mono">FIT</span>
                      <span className="mono">{job.fitOverallScore}</span>
                    </span>
                  )}
                  {job.distanceKm !== null && job.distanceKm !== undefined && (
                    <span
                      className="chip"
                      title="Straight-line distance from your home to the resolved work location (city-matched office > closest office > HQ). Updates when you open the role."
                    >
                      <span className="mono">🚊</span>
                      <span className="mono">
                        {job.distanceKm.toLocaleString()} km
                      </span>
                    </span>
                  )}
                  {sources.map((s, i) => (
                    <span key={s} className="chip">
                      <span className="dot" style={{ background: i === 0 ? "var(--accent)" : "var(--fg-4)" }} />
                      {s}
                    </span>
                  ))}

                  <span className="vrule" />

                  {salary && <span className="mono text-[var(--fg-2)]">{salary}</span>}
                  {job.postedAt && (
                    <span className="text-[var(--fg-3)]">
                      posted <span className="mono">{timeAgo(job.postedAt)}</span> ago
                    </span>
                  )}
                  {job.fetchedAt && (
                    <span className="text-[var(--fg-4)]">
                      ingested <span className="mono">{timeAgo(job.fetchedAt)}</span> ago
                    </span>
                  )}
                </div>
              </div>
            </Link>

            <div className="absolute right-3 top-1/2 -translate-y-1/2 fade-in-hover">
              <TrackJobButton jobId={job.id} variant="icon" />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
