"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Bell,
  BellOff,
  ExternalLink,
  GripVertical,
  MoreVertical,
  StickyNote,
  Trash2,
} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { toast } from "sonner";
import type { ApplicationWithJob } from "@/lib/repo/applications";

type DragHandleProps = Record<string, unknown>;

type Props = {
  application: ApplicationWithJob;
  onDelete: (id: number) => Promise<void> | void;
  onNotesSave: (id: number, notesMd: string) => Promise<void>;
  onReminderSave: (
    id: number,
    reminderAt: string | null,
  ) => Promise<boolean>;
  dragging?: boolean;
  dragHandleProps?: DragHandleProps;
};

function daysAgo(date: Date | null): string | null {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  const diffMs = Date.now() - d.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function relativeFromNow(date: Date | null): string | null {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  const diffMs = d.getTime() - Date.now();
  const absMs = Math.abs(diffMs);
  const minutes = Math.round(absMs / (1000 * 60));
  const hours = Math.round(absMs / (1000 * 60 * 60));
  const days = Math.round(absMs / (1000 * 60 * 60 * 24));
  const future = diffMs >= 0;
  if (minutes < 1) return future ? "now" : "just now";
  if (minutes < 60) return future ? `in ${minutes}m` : `${minutes}m ago`;
  if (hours < 24) return future ? `in ${hours}h` : `${hours}h ago`;
  if (days < 30) return future ? `in ${days}d` : `${days}d ago`;
  return d.toLocaleDateString();
}

function formatReminder(date: Date): string {
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

// Convert a Date to the local "yyyy-MM-ddTHH:mm" string required by
// <input type="datetime-local"> without the timezone drift of toISOString().
function toLocalInputValue(date: Date | null): string {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(date);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export function KanbanCard({
  application,
  onDelete,
  onNotesSave,
  onReminderSave,
  dragging,
  dragHandleProps,
}: Props) {
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState(application.notesMd ?? "");
  const [saving, setSaving] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderDraft, setReminderDraft] = useState(
    toLocalInputValue(application.reminderAt ?? null),
  );
  const [reminderSaving, setReminderSaving] = useState(false);

  const showDaysAgo =
    application.appliedAt &&
    ["applied", "phone", "onsite", "offer", "rejected"].includes(
      application.stage,
    );
  const days = showDaysAgo ? daysAgo(application.appliedAt) : null;

  const reminderDate = application.reminderAt
    ? application.reminderAt instanceof Date
      ? application.reminderAt
      : new Date(application.reminderAt)
    : null;
  const reminderRelative = relativeFromNow(reminderDate);
  const hasReminder = reminderDate !== null;

  async function handleBlur() {
    if (notes === (application.notesMd ?? "")) return;
    setSaving(true);
    try {
      await onNotesSave(application.id, notes);
    } finally {
      setSaving(false);
    }
  }

  async function handleReminderConfirm() {
    if (!reminderDraft) return;
    const iso = new Date(reminderDraft).toISOString();
    setReminderSaving(true);
    const ok = await onReminderSave(application.id, iso);
    setReminderSaving(false);
    if (ok) {
      toast.success(`Reminder set for ${formatReminder(new Date(iso))}`);
      setReminderOpen(false);
    }
  }

  async function handleReminderClear() {
    setReminderSaving(true);
    const ok = await onReminderSave(application.id, null);
    setReminderSaving(false);
    if (ok) {
      toast.success("Reminder cleared");
      setReminderDraft("");
      setReminderOpen(false);
    }
  }

  return (
    <div
      className={`group rounded-md border border-[var(--border)] bg-[var(--background)] p-2 text-sm shadow-sm transition-shadow hover:shadow ${
        dragging ? "shadow-lg" : ""
      }`}
    >
      <div className="flex items-start gap-1">
        <button
          type="button"
          aria-label="Drag"
          className="mt-0.5 cursor-grab touch-none rounded p-0.5 text-[var(--muted-foreground)] hover:bg-[var(--muted)] active:cursor-grabbing"
          {...dragHandleProps}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium" title={application.job.title}>
            {application.job.title}
          </div>
          <div
            className="truncate text-xs text-[var(--muted-foreground)]"
            title={`${application.job.company}${
              application.job.location ? ` · ${application.job.location}` : ""
            }`}
          >
            {application.job.company}
            {application.job.location ? ` · ${application.job.location}` : ""}
          </div>
          {days ? (
            <div className="mt-1 text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
              Applied {days}
            </div>
          ) : null}
          {hasReminder && reminderDate ? (
            <div
              className="mt-1 inline-flex items-center gap-1 text-[10px] text-[var(--muted-foreground)]"
              title={formatReminder(reminderDate)}
            >
              <Bell className="h-3 w-3" />
              <span>{reminderRelative}</span>
            </div>
          ) : null}
        </div>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              aria-label="Card actions"
              className="rounded p-0.5 text-[var(--muted-foreground)] opacity-60 hover:bg-[var(--muted)] group-hover:opacity-100"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={4}
              className="z-50 min-w-[160px] rounded-md border border-[var(--border)] bg-[var(--background)] p-1 text-sm shadow-md"
            >
              <DropdownMenu.Item asChild>
                <Link
                  href={`/jobs/${application.jobId}`}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 outline-none hover:bg-[var(--muted)]"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open job
                </Link>
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 outline-none hover:bg-[var(--muted)]"
                onSelect={(e) => {
                  e.preventDefault();
                  setNotesOpen((v) => !v);
                }}
              >
                <StickyNote className="h-3.5 w-3.5" />
                {notesOpen ? "Hide notes" : "Edit notes"}
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 outline-none hover:bg-[var(--muted)]"
                onSelect={(e) => {
                  e.preventDefault();
                  setReminderDraft(
                    toLocalInputValue(reminderDate) ||
                      toLocalInputValue(new Date(Date.now() + 24 * 60 * 60 * 1000)),
                  );
                  setReminderOpen(true);
                }}
              >
                <Bell className="h-3.5 w-3.5" />
                {hasReminder ? "Edit reminder" : "Set reminder"}
              </DropdownMenu.Item>
              {hasReminder ? (
                <DropdownMenu.Item
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 outline-none hover:bg-[var(--muted)]"
                  onSelect={(e) => {
                    e.preventDefault();
                    void handleReminderClear();
                  }}
                >
                  <BellOff className="h-3.5 w-3.5" />
                  Clear reminder
                </DropdownMenu.Item>
              ) : null}
              <DropdownMenu.Separator className="my-1 h-px bg-[var(--border)]" />
              <DropdownMenu.Item
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[var(--danger)] outline-none hover:bg-[var(--danger)]/10"
                onSelect={() => onDelete(application.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
      {notesOpen ? (
        <div className="mt-2">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={handleBlur}
            placeholder="Notes (markdown)…"
            rows={3}
            className="w-full resize-y rounded border border-[var(--border)] bg-[var(--background)] p-1.5 text-xs outline-none focus:ring-1 focus:ring-[var(--accent)]"
          />
          <div className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">
            {saving ? "Saving…" : "Saved on blur"}
          </div>
        </div>
      ) : null}
      {reminderOpen ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <input
            type="datetime-local"
            value={reminderDraft}
            onChange={(e) => setReminderDraft(e.target.value)}
            aria-label="Reminder date and time"
            className="flex-1 min-w-[140px] rounded border border-[var(--border)] bg-[var(--background)] px-1.5 py-1 text-xs outline-none focus:ring-1 focus:ring-[var(--accent)]"
          />
          <button
            type="button"
            onClick={handleReminderConfirm}
            disabled={!reminderDraft || reminderSaving}
            className="rounded bg-[var(--accent)] px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
          >
            {reminderSaving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setReminderOpen(false)}
            className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--muted)]"
          >
            Cancel
          </button>
        </div>
      ) : null}
    </div>
  );
}
