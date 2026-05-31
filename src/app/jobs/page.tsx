import { countJobsByBand, listJobs, type ScoreBand } from "@/lib/repo/jobs";
import { JobList } from "@/components/job-list";
import { JobPasteForm } from "@/components/job-paste-form";
import { JobsSearchForm } from "@/components/jobs-search-form";
import Link from "next/link";

export const dynamic = "force-dynamic";

const VALID_BANDS = ["all", "top", "stretch", "pass", "unscored"] as const;

function parseBand(input: string | string[] | undefined): ScoreBand {
  const raw = Array.isArray(input) ? input[0] : input;
  if (raw && (VALID_BANDS as readonly string[]).includes(raw)) return raw as ScoreBand;
  return "all";
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ band?: string }>;
}) {
  const sp = await searchParams;
  const band = parseBand(sp.band);
  const [jobs, counts] = await Promise.all([listJobs({ band }), countJobsByBand()]);

  const chips: { id: ScoreBand; label: string }[] = [
    { id: "all", label: "all" },
    { id: "top", label: "top ≥70" },
    { id: "stretch", label: "stretch 50–69" },
    { id: "pass", label: "pass <50" },
    { id: "unscored", label: "unscored" },
  ];

  const activeChip = chips.find((c) => c.id === band);

  return (
    <div className="space-y-8">
      <section className="rise" data-delay="1">
        <div className="section-label mb-2">vol. iii · the firehose, ranked</div>
        <h1 className="page-title">
          <span>Jobs</span>
          {band !== "all" && (
            <>
              <span className="text-[var(--fg-4)] mx-3 font-normal" style={{ fontFamily: "var(--font-sans)" }}>
                /
              </span>
              <span
                className="italic font-normal text-[var(--accent)]"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                {activeChip?.label}
              </span>
            </>
          )}
        </h1>
        <p className="subtitle mt-2">
          Ranked by best CV-match score across {counts.all} ingested jobs from{" "}
          <Link href="/search" className="text-[var(--fg-2)] hover:text-[var(--accent)] underline underline-offset-2 decoration-[var(--border-hi)]">
            saved searches
          </Link>
          . Sourced from 11 adapters; auto-scored against your active CV.
        </p>
      </section>

      <section className="kpi-grid rise" data-delay="2">
        {chips.map((c) => (
          <Link
            key={c.id}
            href={c.id === "all" ? "/jobs" : `/jobs?band=${c.id}`}
            className="kpi-cell hover:bg-[var(--bg-elev-2)] transition-colors group"
            style={{
              outline: band === c.id ? "1px solid var(--accent)" : undefined,
              outlineOffset: band === c.id ? "-1px" : undefined,
            }}
          >
            <span className="label">{c.label}</span>
            <span className="value" style={{ color: band === c.id ? "var(--accent)" : undefined }}>
              {counts[c.id]?.toLocaleString() ?? 0}
            </span>
          </Link>
        ))}
      </section>

      <section className="rise" data-delay="3">
        <details className="card group">
          <summary className="cursor-pointer flex items-center justify-between px-4 py-3 text-[13px] text-[var(--fg-2)] hover:text-[var(--fg)] transition-colors list-none [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2">
              <span
                className="italic text-[var(--fg-3)]"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                one-shot search
              </span>
              <span className="text-[var(--fg-4)]">— manual fetch via JSearch, LinkedIn, or paste</span>
            </span>
            <span className="font-mono text-[11px] text-[var(--fg-4)] group-open:rotate-180 transition-transform">▾</span>
          </summary>
          <div className="border-t border-[var(--border)] px-4 py-4 space-y-3">
            <JobsSearchForm />
            <JobPasteForm />
          </div>
        </details>
      </section>

      <section className="space-y-3 rise" data-delay="4">
        <div className="flex items-baseline justify-between">
          <h2 className="section-label">
            {band === "all" ? "all jobs" : `${activeChip?.label}`}
          </h2>
          <span className="text-[11px] text-[var(--fg-4)] font-mono uppercase tracking-wider">
            showing {jobs.length}
            {jobs.length === 200 ? " (cap)" : ""}
          </span>
        </div>
        <JobList jobs={jobs} />
      </section>
    </div>
  );
}
