"use client";

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Label from "@radix-ui/react-label";
import { X } from "lucide-react";
import type { InterviewRow, InterviewStatus, InterviewType } from "@/lib/repo/interviews";

type Mode = "create" | "edit";

type InitialShape = Partial<InterviewRow>;

type InterviewFormProps = {
  mode: Mode;
  initial?: InitialShape;
  applicationId?: number;
  trigger: React.ReactNode;
  onSaved?: () => void;
};

const TYPES: { value: InterviewType; label: string }[] = [
  { value: "phone", label: "Phone" },
  { value: "video", label: "Video" },
  { value: "onsite", label: "Onsite" },
  { value: "take_home", label: "Take-home" },
  { value: "technical", label: "Technical" },
  { value: "system_design", label: "System Design" },
  { value: "behavioral", label: "Behavioral" },
  { value: "final", label: "Final" },
];

const STATUSES: { value: InterviewStatus; label: string }[] = [
  { value: "scheduled", label: "Scheduled" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no_show", label: "No show" },
];

const inputCls =
  "w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]";
const labelCls = "text-sm font-medium";
const fieldCls = "space-y-1.5";

function toDatetimeLocal(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function InterviewForm({
  mode,
  initial,
  applicationId,
  trigger,
  onSaved,
}: InterviewFormProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [scheduledAt, setScheduledAt] = useState<string>(
    toDatetimeLocal(initial?.scheduledAt ?? null),
  );
  const [durationMin, setDurationMin] = useState<number>(
    initial?.durationMin ?? 45,
  );
  const [type, setType] = useState<InterviewType>(
    (initial?.type as InterviewType) ?? "phone",
  );
  const [status, setStatus] = useState<InterviewStatus>(
    (initial?.status as InterviewStatus) ?? "scheduled",
  );
  const [interviewerName, setInterviewerName] = useState<string>(
    initial?.interviewerName ?? "",
  );
  const [interviewerTitle, setInterviewerTitle] = useState<string>(
    initial?.interviewerTitle ?? "",
  );
  const [meetingUrl, setMeetingUrl] = useState<string>(initial?.meetingUrl ?? "");
  const [locationText, setLocationText] = useState<string>(
    initial?.locationText ?? "",
  );
  const [prepNotesMd, setPrepNotesMd] = useState<string>(
    initial?.prepNotesMd ?? "",
  );
  const [postNotesMd, setPostNotesMd] = useState<string>(
    initial?.postNotesMd ?? "",
  );

  // Reset local state when dialog opens with fresh initial
  useEffect(() => {
    if (!open) return;
    setError(null);
    setScheduledAt(toDatetimeLocal(initial?.scheduledAt ?? null));
    setDurationMin(initial?.durationMin ?? 45);
    setType((initial?.type as InterviewType) ?? "phone");
    setStatus((initial?.status as InterviewStatus) ?? "scheduled");
    setInterviewerName(initial?.interviewerName ?? "");
    setInterviewerTitle(initial?.interviewerTitle ?? "");
    setMeetingUrl(initial?.meetingUrl ?? "");
    setLocationText(initial?.locationText ?? "");
    setPrepNotesMd(initial?.prepNotesMd ?? "");
    setPostNotesMd(initial?.postNotesMd ?? "");
  }, [open, initial]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!scheduledAt) {
      setError("Scheduled date/time is required.");
      return;
    }
    if (mode === "create" && !applicationId) {
      setError("applicationId is required for creation.");
      return;
    }

    const iso = new Date(scheduledAt).toISOString();

    const basePayload: Record<string, unknown> = {
      scheduledAt: iso,
      durationMin,
      type,
      interviewerName: interviewerName || undefined,
      interviewerTitle: interviewerTitle || undefined,
      meetingUrl: meetingUrl || undefined,
      locationText: locationText || undefined,
      prepNotesMd,
    };

    if (mode === "edit") {
      basePayload.status = status;
      basePayload.postNotesMd = postNotesMd;
    }

    setSaving(true);
    try {
      let res: Response;
      if (mode === "create") {
        res = await fetch("/api/interviews", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ applicationId, ...basePayload }),
        });
      } else {
        if (!initial?.id) throw new Error("Missing interview id for edit.");
        res = await fetch(`/api/interviews/${initial.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(basePayload),
        });
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          typeof body?.error === "string"
            ? body.error
            : `Request failed: ${res.status}`,
        );
      }
      setOpen(false);
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[94vw] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-[var(--border)] bg-[var(--background)] shadow-lg">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <Dialog.Title className="text-base font-semibold">
              {mode === "create" ? "Schedule interview" : "Edit interview"}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="rounded p-1 text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            {mode === "create"
              ? "Create a new interview round."
              : "Edit interview details and notes."}
          </Dialog.Description>

          <form
            onSubmit={onSubmit}
            className="flex flex-1 flex-col gap-4 overflow-y-auto p-4"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className={fieldCls}>
                <Label.Root className={labelCls} htmlFor="iv-scheduled">
                  Scheduled at
                </Label.Root>
                <input
                  id="iv-scheduled"
                  type="datetime-local"
                  className={inputCls}
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  required
                />
              </div>
              <div className={fieldCls}>
                <Label.Root className={labelCls} htmlFor="iv-duration">
                  Duration (min)
                </Label.Root>
                <input
                  id="iv-duration"
                  type="number"
                  min={5}
                  max={600}
                  className={inputCls}
                  value={durationMin}
                  onChange={(e) => setDurationMin(Number(e.target.value) || 45)}
                />
              </div>
              <div className={fieldCls}>
                <Label.Root className={labelCls} htmlFor="iv-type">
                  Type
                </Label.Root>
                <select
                  id="iv-type"
                  className={inputCls}
                  value={type}
                  onChange={(e) => setType(e.target.value as InterviewType)}
                >
                  {TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              {mode === "edit" && (
                <div className={fieldCls}>
                  <Label.Root className={labelCls} htmlFor="iv-status">
                    Status
                  </Label.Root>
                  <select
                    id="iv-status"
                    className={inputCls}
                    value={status}
                    onChange={(e) =>
                      setStatus(e.target.value as InterviewStatus)
                    }
                  >
                    {STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className={fieldCls}>
                <Label.Root className={labelCls} htmlFor="iv-interviewer">
                  Interviewer name
                </Label.Root>
                <input
                  id="iv-interviewer"
                  className={inputCls}
                  value={interviewerName}
                  onChange={(e) => setInterviewerName(e.target.value)}
                />
              </div>
              <div className={fieldCls}>
                <Label.Root className={labelCls} htmlFor="iv-interviewer-title">
                  Interviewer title
                </Label.Root>
                <input
                  id="iv-interviewer-title"
                  className={inputCls}
                  value={interviewerTitle}
                  onChange={(e) => setInterviewerTitle(e.target.value)}
                />
              </div>
              <div className={fieldCls}>
                <Label.Root className={labelCls} htmlFor="iv-meeting">
                  Meeting URL
                </Label.Root>
                <input
                  id="iv-meeting"
                  type="url"
                  className={inputCls}
                  value={meetingUrl}
                  placeholder="https://…"
                  onChange={(e) => setMeetingUrl(e.target.value)}
                />
              </div>
              <div className={fieldCls}>
                <Label.Root className={labelCls} htmlFor="iv-location">
                  Location
                </Label.Root>
                <input
                  id="iv-location"
                  className={inputCls}
                  value={locationText}
                  onChange={(e) => setLocationText(e.target.value)}
                />
              </div>
            </div>

            <div className={fieldCls}>
              <Label.Root className={labelCls} htmlFor="iv-prep">
                Prep notes (Markdown)
              </Label.Root>
              <textarea
                id="iv-prep"
                className={`${inputCls} h-28 resize-y`}
                value={prepNotesMd}
                onChange={(e) => setPrepNotesMd(e.target.value)}
              />
            </div>

            {mode === "edit" && (
              <div className={fieldCls}>
                <Label.Root className={labelCls} htmlFor="iv-post">
                  Post-interview notes (Markdown)
                </Label.Root>
                <textarea
                  id="iv-post"
                  className={`${inputCls} h-28 resize-y`}
                  value={postNotesMd}
                  onChange={(e) => setPostNotesMd(e.target.value)}
                />
              </div>
            )}

            {error && (
              <div className="rounded-md border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">
                {error}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] pt-3">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-md border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--muted)]"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-[var(--foreground)] px-4 py-2 text-sm font-medium text-[var(--background)] disabled:opacity-50"
              >
                {saving
                  ? "Saving…"
                  : mode === "create"
                    ? "Create interview"
                    : "Save changes"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
