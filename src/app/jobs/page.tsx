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

  const chips: { id: ScoreBand; label: string; emoji: string }[] = [
    { id: "all", label: "All", emoji: "📋" },
    { id: "top", label: "Top (≥70)", emoji: "🔥" },
    { id: "stretch", label: "Stretch (50-69)", emoji: "💪" },
    { id: "pass", label: "Pass (<50)", emoji: "😴" },
    { id: "unscored", label: "Unscored", emoji: "❓" },
  ];

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Jobs</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Ranked by best CV-match score across all sources. Set up a{" "}
          <Link href="/search" className="underline underline-offset-2 hover:text-[var(--foreground)]">
            saved search
          </Link>{" "}
          to populate this feed automatically.
        </p>
      </section>

      <section className="flex flex-wrap items-center gap-2">
        {chips.map((c) => {
          const active = band === c.id;
          const count = counts[c.id] ?? 0;
          return (
            <Link
              key={c.id}
              href={c.id === "all" ? "/jobs" : `/jobs?band=${c.id}`}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                active
                  ? "border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]"
                  : "border-[var(--border)] bg-[var(--background)] hover:bg-[var(--muted)]"
              }`}
            >
              <span className="mr-1">{c.emoji}</span>
              {c.label}{" "}
              <span className="opacity-70">({count})</span>
            </Link>
          );
        })}
      </section>

      <section className="space-y-4">
        <JobsSearchForm />
        <JobPasteForm />
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold tracking-tight">
            {band === "all" ? "Saved jobs" : `${chips.find((c) => c.id === band)?.label}`}
          </h2>
          <span className="text-xs text-[var(--muted-foreground)]">
            showing {jobs.length}
            {jobs.length === 200 ? " (cap)" : ""}
          </span>
        </div>
        <JobList jobs={jobs} />
      </section>
    </div>
  );
}
