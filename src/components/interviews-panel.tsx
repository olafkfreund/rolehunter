"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Pencil, Plus, Trash2 } from "lucide-react";
import type { InterviewRow } from "@/lib/repo/interviews";
import { InterviewForm } from "./interview-form";

type InterviewsPanelProps = {
  applicationId: number;
  initial?: InterviewRow[];
};

const TYPE_LABELS: Record<string, string> = {
  phone: "Phone",
  video: "Video",
  onsite: "Onsite",
  take_home: "Take-home",
  technical: "Technical",
  system_design: "System Design",
  behavioral: "Behavioral",
  final: "Final",
};

const STATUS_STYLES: Record<string, string> = {
  scheduled: "bg-[var(--accent)]/10 text-[var(--accent)]",
  completed: "bg-[var(--success)]/10 text-[var(--success)]",
  cancelled: "bg-[var(--muted)] text-[var(--muted-foreground)]",
  no_show: "bg-[var(--danger)]/10 text-[var(--danger)]",
};

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No show",
};

function fmtWhen(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return `${date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })} · ${date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export function InterviewsPanel({
  applicationId,
  initial,
}: InterviewsPanelProps) {
  const [rows, setRows] = useState<InterviewRow[]>(initial ?? []);
  const [loading, setLoading] = useState(initial === undefined);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/interviews?appId=${applicationId}`);
      if (!res.ok) throw new Error(`GET interviews ${res.status}`);
      const data = (await res.json()) as InterviewRow[];
      setRows(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

  useEffect(() => {
    if (initial === undefined) {
      void refetch();
    }
  }, [initial, refetch]);

  async function handleDelete(id: number) {
    if (!confirm("Delete this interview?")) return;
    const prev = rows;
    setRows((list) => list.filter((r) => r.id !== id));
    try {
      const res = await fetch(`/api/interviews/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`DELETE ${res.status}`);
    } catch (err) {
      console.error(err);
      setRows(prev);
      alert("Failed to delete interview.");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Interviews</h3>
        <InterviewForm
          mode="create"
          applicationId={applicationId}
          onSaved={refetch}
          trigger={
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1 text-xs hover:bg-[var(--muted)]"
            >
              <Plus className="h-3.5 w-3.5" />
              Add interview
            </button>
          }
        />
      </div>

      {error && (
        <div className="rounded-md border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-xs text-[var(--danger)]">
          {error}
        </div>
      )}

      {loading && rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--border)] px-3 py-4 text-center text-xs text-[var(--muted-foreground)]">
          Loading…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--border)] px-3 py-4 text-center text-xs text-[var(--muted-foreground)]">
          No interviews scheduled yet.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((iv) => (
            <li
              key={iv.id}
              className="flex items-start justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 text-sm">
                  <span className="font-medium">{fmtWhen(iv.scheduledAt)}</span>
                  <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-xs">
                    {TYPE_LABELS[iv.type] ?? iv.type}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLES[iv.status] ?? ""}`}
                  >
                    {STATUS_LABELS[iv.status] ?? iv.status}
                  </span>
                </div>
                {(iv.interviewerName || iv.locationText || iv.meetingUrl) && (
                  <div className="mt-0.5 truncate text-xs text-[var(--muted-foreground)]">
                    {[
                      iv.interviewerName,
                      iv.interviewerTitle,
                      iv.locationText,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    {iv.meetingUrl && (
                      <>
                        {" · "}
                        <a
                          href={iv.meetingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[var(--accent)] underline"
                        >
                          link
                        </a>
                      </>
                    )}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <InterviewForm
                  mode="edit"
                  initial={iv}
                  onSaved={refetch}
                  trigger={
                    <button
                      type="button"
                      aria-label="Edit"
                      className="rounded p-1 text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  }
                />
                <button
                  type="button"
                  aria-label="Delete"
                  onClick={() => handleDelete(iv.id)}
                  className="rounded p-1 text-[var(--muted-foreground)] hover:bg-[var(--danger)]/10 hover:text-[var(--danger)]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Per-row action buttons used by InterviewsTable (server-rendered shell). */
export function InterviewRowActions({
  interview,
}: {
  interview: InterviewRow;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    if (!confirm("Delete this interview?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/interviews/${interview.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`DELETE ${res.status}`);
      router.refresh();
    } catch (err) {
      console.error(err);
      alert("Failed to delete interview.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inline-flex items-center justify-end gap-1">
      <InterviewForm
        mode="edit"
        initial={interview}
        onSaved={() => router.refresh()}
        trigger={
          <button
            type="button"
            aria-label="Edit"
            className="rounded p-1 text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        }
      />
      <button
        type="button"
        aria-label="Delete"
        disabled={busy}
        onClick={handleDelete}
        className="rounded p-1 text-[var(--muted-foreground)] hover:bg-[var(--danger)]/10 hover:text-[var(--danger)] disabled:opacity-50"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** Standalone "Add interview" button intended for top-of-page use; opens dialog
 *  needing the user to provide an application id afterward via the form fields.
 *  Currently we only support adding via per-application widget, so this button
 *  routes to /kanban for now. Exposed for /interviews page header. */
export function AddInterviewButton({
  applicationId,
}: {
  applicationId?: number;
}) {
  if (applicationId) {
    return (
      <InterviewForm
        mode="create"
        applicationId={applicationId}
        trigger={
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-md bg-[var(--primary)] px-3 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90"
          >
            <CalendarPlus className="h-4 w-4" />
            Add interview
          </button>
        }
      />
    );
  }
  return (
    <a
      href="/kanban"
      className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm font-medium hover:bg-[var(--muted)]"
      title="Pick an application from the tracker to add interviews."
    >
      <CalendarPlus className="h-4 w-4" />
      Add from tracker
    </a>
  );
}
