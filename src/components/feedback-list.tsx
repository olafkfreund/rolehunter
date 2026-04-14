import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { InterviewFeedback } from "@/lib/db/schema";

type CategoryStyle = {
  label: string;
  classes: string;
};

const CATEGORY_STYLES: Record<string, CategoryStyle> = {
  resume_screen: {
    label: "Resume screen",
    classes:
      "bg-[var(--muted)]/60 text-[var(--muted-foreground)] border border-[var(--border)]",
  },
  technical: {
    label: "Technical",
    classes: "bg-[var(--warning)]/10 text-[var(--warning)]",
  },
  behavioral: {
    label: "Behavioral",
    classes: "bg-[var(--warning)]/10 text-[var(--warning)]",
  },
  culture: {
    label: "Culture",
    classes: "bg-[var(--accent)]/10 text-[var(--accent)]",
  },
  salary: {
    label: "Salary",
    classes:
      "bg-[var(--muted)]/60 text-[var(--muted-foreground)] border border-[var(--border)]",
  },
  position_closed: {
    label: "Position closed",
    classes:
      "bg-[var(--muted)]/60 text-[var(--muted-foreground)] border border-[var(--border)]",
  },
  other: {
    label: "Other",
    classes:
      "bg-[var(--muted)]/60 text-[var(--muted-foreground)] border border-[var(--border)]",
  },
};

const SOURCE_LABELS: Record<string, string> = {
  self: "Self",
  recruiter: "Recruiter",
  llm_synthesis: "LLM synthesis",
};

function formatDate(input: Date | string): string {
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Stars({ rating }: { rating: number | null }) {
  if (rating === null) return null;
  const clamped = Math.max(1, Math.min(5, Math.round(rating)));
  return (
    <span className="inline-flex items-center gap-0.5 text-[var(--warning)]">
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} aria-hidden>
          {n <= clamped ? "★" : "☆"}
        </span>
      ))}
      <span className="sr-only">
        {clamped} out of 5 stars
      </span>
    </span>
  );
}

function MdSection({ title, body }: { title: string; body: string }) {
  if (!body || !body.trim()) return null;
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
        {title}
      </div>
      <div className="prose prose-sm max-w-none rounded-md border border-[var(--border)] bg-[var(--muted)]/30 p-3 text-sm text-[var(--foreground)]">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
      </div>
    </div>
  );
}

export function FeedbackList({ rows }: { rows: InterviewFeedback[] }) {
  if (!rows.length) {
    return (
      <div className="rounded-md border border-dashed border-[var(--border)] bg-[var(--muted)]/30 p-4 text-sm text-[var(--muted-foreground)]">
        No feedback logged for this application yet.
      </div>
    );
  }

  return (
    <ul className="space-y-4">
      {rows.map((r) => {
        const cat = r.rejectionCategory
          ? CATEGORY_STYLES[r.rejectionCategory] ?? CATEGORY_STYLES.other
          : null;
        return (
          <li
            key={r.id}
            className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--background)] p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-[var(--border)] px-2.5 py-0.5 text-xs text-[var(--muted-foreground)]">
                {SOURCE_LABELS[r.source] ?? r.source}
              </span>
              <Stars rating={r.rating} />
              {cat && (
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs ${cat.classes}`}
                >
                  {cat.label}
                </span>
              )}
              <span className="ml-auto text-xs text-[var(--muted-foreground)]">
                {formatDate(r.createdAt)}
              </span>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <MdSection title="What went well" body={r.whatWentWellMd} />
              <MdSection title="What went badly" body={r.whatWentBadlyMd} />
              <MdSection title="What to change" body={r.whatToChangeMd} />
            </div>

            {r.recruiterVerbatim && r.recruiterVerbatim.trim() && (
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Recruiter verbatim
                </div>
                <blockquote className="rounded-md border-l-2 border-[var(--accent)] bg-[var(--muted)]/30 p-3 text-sm italic text-[var(--foreground)]">
                  {r.recruiterVerbatim}
                </blockquote>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
