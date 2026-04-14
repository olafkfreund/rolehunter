"use client";

import { useState } from "react";
import type { InterviewFeedback } from "@/lib/db/schema";
import type {
  FeedbackSource,
  RejectionCategory,
} from "@/lib/repo/feedback";

type Props = {
  applicationId: number;
  interviewId?: number | null;
  onSaved?: () => void;
  initial?: Partial<InterviewFeedback>;
};

const SOURCES: Array<{ value: FeedbackSource; label: string }> = [
  { value: "self", label: "Self" },
  { value: "recruiter", label: "Recruiter" },
  { value: "llm_synthesis", label: "LLM synthesis" },
];

const CATEGORIES: Array<{ value: RejectionCategory; label: string }> = [
  { value: "resume_screen", label: "Resume screen" },
  { value: "technical", label: "Technical" },
  { value: "behavioral", label: "Behavioral" },
  { value: "culture", label: "Culture" },
  { value: "salary", label: "Salary" },
  { value: "position_closed", label: "Position closed" },
  { value: "other", label: "Other" },
];

function flattenError(err: unknown): string {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  if (typeof err === "object") {
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

export function FeedbackForm({
  applicationId,
  interviewId,
  onSaved,
  initial,
}: Props) {
  const [source, setSource] = useState<FeedbackSource>(
    (initial?.source as FeedbackSource | undefined) ?? "self",
  );
  const [rating, setRating] = useState<number | null>(
    typeof initial?.rating === "number" ? initial.rating : null,
  );
  const [category, setCategory] = useState<RejectionCategory | "">(
    (initial?.rejectionCategory as RejectionCategory | null) ?? "",
  );
  const [well, setWell] = useState<string>(initial?.whatWentWellMd ?? "");
  const [badly, setBadly] = useState<string>(initial?.whatWentBadlyMd ?? "");
  const [change, setChange] = useState<string>(initial?.whatToChangeMd ?? "");
  const [verbatim, setVerbatim] = useState<string>(
    initial?.recruiterVerbatim ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = typeof initial?.id === "number";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        applicationId,
        interviewId: interviewId ?? null,
        source,
        rejectionCategory: category === "" ? null : category,
        rating: rating ?? null,
        whatWentWellMd: well,
        whatWentBadlyMd: badly,
        whatToChangeMd: change,
        recruiterVerbatim:
          source === "recruiter" && verbatim.trim() ? verbatim : null,
      };

      const res = await fetch(
        isEdit ? `/api/feedback/${initial!.id}` : "/api/feedback",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(flattenError(json?.error ?? "Save failed"));
      }
      if (!isEdit) {
        setRating(null);
        setCategory("");
        setWell("");
        setBadly("");
        setChange("");
        setVerbatim("");
      }
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--background)] p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">
            {isEdit ? "Edit feedback" : "Log feedback"}
          </h2>
          <p className="text-xs text-[var(--muted-foreground)]">
            Capture what happened while it&apos;s fresh.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            Source
          </div>
          <div className="flex flex-wrap gap-2">
            {SOURCES.map((s) => (
              <label
                key={s.value}
                className={`cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors ${
                  source === s.value
                    ? "border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]"
                    : "border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                }`}
              >
                <input
                  type="radio"
                  name="source"
                  value={s.value}
                  checked={source === s.value}
                  onChange={() => setSource(s.value)}
                  className="sr-only"
                />
                {s.label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            Rating
          </div>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => {
              const active = rating !== null && n <= rating;
              return (
                <button
                  key={n}
                  type="button"
                  aria-label={`${n} star${n === 1 ? "" : "s"}`}
                  onClick={() => setRating(rating === n ? null : n)}
                  className={`flex h-8 w-8 items-center justify-center rounded-md border text-lg leading-none transition-colors ${
                    active
                      ? "border-[var(--warning)] bg-[var(--warning)]/10 text-[var(--warning)]"
                      : "border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  }`}
                >
                  {active ? "★" : "☆"}
                </button>
              );
            })}
            {rating !== null && (
              <button
                type="button"
                onClick={() => setRating(null)}
                className="ml-2 text-xs text-[var(--muted-foreground)] underline hover:text-[var(--foreground)]"
              >
                clear
              </button>
            )}
          </div>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
          Rejection category
        </label>
        <select
          value={category}
          onChange={(e) =>
            setCategory(e.target.value as RejectionCategory | "")
          }
          className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)]"
        >
          <option value="">— None —</option>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            What went well
          </label>
          <textarea
            value={well}
            onChange={(e) => setWell(e.target.value)}
            rows={5}
            placeholder="Markdown…"
            className="w-full resize-y rounded-md border border-[var(--border)] bg-[var(--background)] p-2 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)]"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            What went badly
          </label>
          <textarea
            value={badly}
            onChange={(e) => setBadly(e.target.value)}
            rows={5}
            placeholder="Markdown…"
            className="w-full resize-y rounded-md border border-[var(--border)] bg-[var(--background)] p-2 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)]"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            What to change
          </label>
          <textarea
            value={change}
            onChange={(e) => setChange(e.target.value)}
            rows={5}
            placeholder="Markdown…"
            className="w-full resize-y rounded-md border border-[var(--border)] bg-[var(--background)] p-2 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)]"
          />
        </div>
      </div>

      {source === "recruiter" && (
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            Recruiter verbatim
          </label>
          <textarea
            value={verbatim}
            onChange={(e) => setVerbatim(e.target.value)}
            rows={4}
            placeholder="Paste the recruiter's exact wording…"
            className="w-full resize-y rounded-md border border-[var(--border)] bg-[var(--background)] p-2 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)]"
          />
        </div>
      )}

      {error && <div className="text-sm text-[var(--danger)]">{error}</div>}

      <div className="flex items-center justify-end gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-[var(--foreground)] px-4 py-1.5 text-sm font-medium text-[var(--background)] disabled:opacity-50"
        >
          {busy ? "Saving…" : isEdit ? "Save changes" : "Save feedback"}
        </button>
      </div>
    </form>
  );
}
