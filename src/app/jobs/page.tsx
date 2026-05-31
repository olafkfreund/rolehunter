import {
  countJobsByBand,
  countJobsByFitBand,
  listJobs,
  type ScoreBand,
  type SortMode,
} from "@/lib/repo/jobs";
import { JobList } from "@/components/job-list";
import { JobPasteForm } from "@/components/job-paste-form";
import { JobUrlImport } from "@/components/job-url-import";
import { JobsSearchForm } from "@/components/jobs-search-form";
import Link from "next/link";

export const dynamic = "force-dynamic";

const VALID_BANDS = ["all", "top", "stretch", "pass", "unscored"] as const;
const VALID_SORTS = ["date", "score", "fit", "distance"] as const;

function parseBand(input: string | string[] | undefined): ScoreBand {
  const raw = Array.isArray(input) ? input[0] : input;
  if (raw && (VALID_BANDS as readonly string[]).includes(raw)) return raw as ScoreBand;
  return "all";
}

function parseSort(input: string | string[] | undefined): SortMode {
  const raw = Array.isArray(input) ? input[0] : input;
  if (raw && (VALID_SORTS as readonly string[]).includes(raw)) return raw as SortMode;
  return "score";
}

function buildHref(
  base: Record<string, string | undefined>,
  patch: Record<string, string | null>,
): string {
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries(base)) if (v) next[k] = v;
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete next[k];
    else next[k] = v;
  }
  const sp = new URLSearchParams(next);
  const qs = sp.toString();
  return qs ? `/jobs?${qs}` : "/jobs";
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ band?: string; fit?: string; sort?: string }>;
}) {
  const sp = await searchParams;
  const band = parseBand(sp.band);
  const fitBand = parseBand(sp.fit);
  const sort = parseSort(sp.sort);

  const [jobs, counts, fitCounts] = await Promise.all([
    listJobs({ band, fitBand, sort }),
    countJobsByBand(),
    countJobsByFitBand(),
  ]);

  const scoreChips: { id: ScoreBand; label: string }[] = [
    { id: "all", label: "all" },
    { id: "top", label: "match ≥70" },
    { id: "stretch", label: "match 50–69" },
    { id: "pass", label: "match <50" },
    { id: "unscored", label: "unscored" },
  ];

  const fitChips: { id: ScoreBand; label: string }[] = [
    { id: "all", label: "any fit" },
    { id: "top", label: "fit ≥70" },
    { id: "stretch", label: "fit 50–69" },
    { id: "pass", label: "fit <50" },
    { id: "unscored", label: "not yet scored" },
  ];

  const sortChips: { id: SortMode; label: string; hint: string }[] = [
    { id: "score", label: "match score", hint: "LLM CV-match (default)" },
    { id: "fit", label: "fit score", hint: "Local 5-dim role-fit dashboard" },
    { id: "distance", label: "closest", hint: "Straight-line km from your home" },
    { id: "date", label: "newest", hint: "Most recently ingested" },
  ];

  const activeScoreChip = scoreChips.find((c) => c.id === band);
  const baseParams = { band: sp.band, fit: sp.fit, sort: sp.sort };

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
                {activeScoreChip?.label}
              </span>
            </>
          )}
        </h1>
        <p className="subtitle mt-2">
          Ranked across {counts.all} ingested jobs from{" "}
          <Link href="/search" className="text-[var(--fg-2)] hover:text-[var(--accent)] underline underline-offset-2 decoration-[var(--border-hi)]">
            saved searches
          </Link>
          . Two scores per row: <strong>match</strong> (LLM, your CV vs the JD)
          and <strong>fit</strong> (local 5-dim dashboard). Sort by either.
        </p>
      </section>

      {/* Match-score band filters (existing) */}
      <section className="kpi-grid rise" data-delay="2">
        {scoreChips.map((c) => (
          <Link
            key={c.id}
            href={buildHref(baseParams, { band: c.id === "all" ? null : c.id })}
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

      {/* Fit-score band filters + sort (new) */}
      <section className="rise space-y-2" data-delay="2">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider text-[var(--fg-3)] font-mono">
              fit filter
            </span>
            <div className="flex gap-1 flex-wrap">
              {fitChips.map((c) => (
                <Link
                  key={c.id}
                  href={buildHref(baseParams, { fit: c.id === "all" ? null : c.id })}
                  className="px-2 py-1 text-[11px] rounded-md border transition-colors"
                  style={{
                    borderColor:
                      fitBand === c.id ? "var(--accent)" : "var(--border)",
                    color: fitBand === c.id ? "var(--fg)" : "var(--fg-3)",
                    background:
                      fitBand === c.id
                        ? "color-mix(in srgb, var(--accent) 8%, transparent)"
                        : undefined,
                  }}
                >
                  {c.label}{" "}
                  <span className="font-mono text-[10px] text-[var(--fg-4)]">
                    {fitCounts[c.id]?.toLocaleString() ?? 0}
                  </span>
                </Link>
              ))}
            </div>
          </div>

          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider text-[var(--fg-3)] font-mono">
              sort by
            </span>
            <div className="flex gap-1">
              {sortChips.map((c) => (
                <Link
                  key={c.id}
                  href={buildHref(baseParams, { sort: c.id === "score" ? null : c.id })}
                  title={c.hint}
                  className="px-2 py-1 text-[11px] rounded-md border transition-colors"
                  style={{
                    borderColor: sort === c.id ? "var(--accent)" : "var(--border)",
                    color: sort === c.id ? "var(--fg)" : "var(--fg-3)",
                    background:
                      sort === c.id
                        ? "color-mix(in srgb, var(--accent) 8%, transparent)"
                        : undefined,
                  }}
                >
                  {c.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
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
            <JobUrlImport />
            <JobPasteForm />
          </div>
        </details>
      </section>

      <section className="space-y-3 rise" data-delay="4">
        <div className="flex items-baseline justify-between">
          <h2 className="section-label">
            {band === "all" && fitBand === "all"
              ? "all jobs"
              : [
                  band !== "all" ? activeScoreChip?.label : null,
                  fitBand !== "all" ? fitChips.find((c) => c.id === fitBand)?.label : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
          </h2>
          <span className="text-[11px] text-[var(--fg-4)] font-mono uppercase tracking-wider">
            sorted by {sortChips.find((c) => c.id === sort)?.label} · showing {jobs.length}
            {jobs.length === 200 ? " (cap)" : ""}
          </span>
        </div>
        <JobList jobs={jobs} />
      </section>
    </div>
  );
}
