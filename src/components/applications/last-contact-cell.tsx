"use client";

import { useState } from "react";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";

type Props = {
  applicationId: number;
  value: Date | null;
  onChanged?: (v: Date | null) => void;
};

function toDateInputValue(d: Date | null): string {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function LastContactCell({ applicationId, value, onChanged }: Props) {
  const [editing, setEditing] = useState(false);
  const [current, setCurrent] = useState<Date | null>(value);
  const [draft, setDraft] = useState<string>(toDateInputValue(value));
  const [saving, setSaving] = useState(false);

  async function commit(nextISO: string) {
    const prev = current;
    const nextDate = nextISO ? new Date(nextISO) : null;
    // Only save if it changed
    const prevISO = prev ? prev.toISOString().slice(0, 10) : "";
    const newISO = nextDate ? nextDate.toISOString().slice(0, 10) : "";
    if (prevISO === newISO) {
      setEditing(false);
      return;
    }
    setCurrent(nextDate);
    setSaving(true);
    try {
      const res = await fetch(`/api/applications/${applicationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lastContact: nextDate ? nextDate.toISOString() : null,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`PATCH ${res.status}: ${text.slice(0, 120)}`);
      }
      onChanged?.(nextDate);
    } catch (err) {
      setCurrent(prev);
      setDraft(toDateInputValue(prev));
      toast.error(
        err instanceof Error ? err.message : "Failed to update last contact",
      );
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <input
        type="date"
        value={draft}
        autoFocus
        disabled={saving}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(draft);
          if (e.key === "Escape") {
            setDraft(toDateInputValue(current));
            setEditing(false);
          }
        }}
        className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)]"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(toDateInputValue(current));
        setEditing(true);
      }}
      className="inline-flex min-w-[6ch] items-center rounded px-1.5 py-0.5 text-sm hover:bg-[var(--muted)]"
    >
      {current ? formatDate(current) : "—"}
    </button>
  );
}
