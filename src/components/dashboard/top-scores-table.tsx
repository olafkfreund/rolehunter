import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ScoreGauge } from "@/components/score-gauge";

type TopMatch = {
  matchId: number;
  score: number;
  provider: "claude" | "gemini" | "openai" | "ollama";
  createdAt: string;
  jobId: number;
  jobTitle: string;
  company: string;
  location: string;
  stage: string | null;
};

type StageStyle = {
  label: string;
  className: string;
};

function stageBadge(stage: string | null): StageStyle | null {
  if (!stage) return null;
  const base = "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide";
  switch (stage) {
    case "saved":
      return {
        label: "Saved",
        className: `${base} bg-[var(--muted)] text-[var(--muted-foreground)]`,
      };
    case "applied":
      return {
        label: "Applied",
        className: `${base} bg-[var(--accent)]/10 text-[var(--accent)]`,
      };
    case "phone":
      return {
        label: "Phone",
        className: `${base} bg-[var(--warning)]/10 text-[var(--warning)]`,
      };
    case "onsite":
      return {
        label: "Onsite",
        className: `${base} bg-[var(--warning)]/10 text-[var(--warning)]`,
      };
    case "offer":
      return {
        label: "Offer",
        className: `${base} bg-[var(--success)]/10 text-[var(--success)]`,
      };
    case "rejected":
      return {
        label: "Rejected",
        className: `${base} bg-[var(--danger)]/10 text-[var(--danger)]`,
      };
    default:
      return {
        label: stage,
        className: `${base} bg-[var(--muted)] text-[var(--muted-foreground)]`,
      };
  }
}

export function TopScoresTable({ rows }: { rows: TopMatch[] }) {
  return (
    <section className="space-y-3">
      <div className="flex justify-end">
        <Link
          href="/jobs"
          className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:underline"
        >
          View all
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted-foreground)]">
          No scored roles yet.{" "}
          <Link
            href="/jobs"
            className="text-[var(--foreground)] underline underline-offset-2"
          >
            Score a job
          </Link>{" "}
          to see it ranked here.
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const badge = stageBadge(r.stage);
            return (
              <li
                key={r.matchId}
                className="flex items-center gap-3 rounded-md border border-[var(--border)] p-3 hover:bg-[var(--muted)]/50"
              >
                <ScoreGauge
                  score={r.score}
                  size={40}
                  strokeWidth={5}
                  showLabel={false}
                />
                <div className="min-w-0 flex-1">
                  <div
                    className="truncate text-sm font-medium"
                    title={r.jobTitle}
                  >
                    {r.jobTitle}
                  </div>
                  <div
                    className="truncate text-xs text-[var(--muted-foreground)]"
                    title={r.company}
                  >
                    {r.company}
                  </div>
                </div>
                {r.location ? (
                  <div
                    className="hidden truncate text-xs text-[var(--muted-foreground)] md:block md:max-w-[160px]"
                    title={r.location}
                  >
                    {r.location}
                  </div>
                ) : null}
                {badge ? (
                  <span className={badge.className}>{badge.label}</span>
                ) : null}
                <Link
                  href={`/jobs/${r.jobId}`}
                  className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                  aria-label={`Open ${r.jobTitle}`}
                >
                  Open
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
