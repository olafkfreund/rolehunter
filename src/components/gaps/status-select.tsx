"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { LearningStatus } from "@/lib/repo/gaps";

const STATUSES: { value: LearningStatus; label: string; dot: string }[] = [
  { value: "to_learn", label: "To learn", dot: "bg-[var(--muted-foreground)]" },
  { value: "learning", label: "Learning", dot: "bg-[var(--warning)]" },
  { value: "done", label: "Done", dot: "bg-[var(--success)]" },
  { value: "dismissed", label: "Dismissed", dot: "bg-[var(--danger)]" },
];

type Props = {
  gapId: number;
  value: LearningStatus;
  onChanged?: (status: LearningStatus) => void;
};

export function StatusSelect({ gapId, value, onChanged }: Props) {
  const [current, setCurrent] = useState<LearningStatus>(value);
  const [saving, setSaving] = useState(false);

  async function handleChange(next: LearningStatus) {
    if (next === current) return;
    const prev = current;
    setCurrent(next);
    setSaving(true);
    try {
      const res = await fetch(`/api/gaps/${gapId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ learningStatus: next }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`PATCH ${res.status}: ${text.slice(0, 120)}`);
      }
      onChanged?.(next);
    } catch (err) {
      setCurrent(prev);
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setSaving(false);
    }
  }

  const active = STATUSES.find((s) => s.value === current) ?? STATUSES[0];

  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <span className={`h-2 w-2 rounded-full ${active.dot}`} aria-hidden />
      <select
        value={current}
        disabled={saving}
        onChange={(e) => handleChange(e.target.value as LearningStatus)}
        className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)] disabled:opacity-50"
      >
        {STATUSES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
    </label>
  );
}
