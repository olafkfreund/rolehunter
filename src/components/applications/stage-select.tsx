"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { ApplicationStage } from "@/lib/repo/applications";

const STAGES: { value: ApplicationStage; label: string; dot: string }[] = [
  { value: "saved", label: "Saved", dot: "bg-[var(--muted-foreground)]" },
  { value: "applied", label: "Applied", dot: "bg-[var(--accent)]" },
  { value: "phone", label: "Phone", dot: "bg-[var(--warning)]" },
  { value: "onsite", label: "Onsite", dot: "bg-[var(--warning)]" },
  { value: "offer", label: "Offer", dot: "bg-[var(--success)]" },
  { value: "rejected", label: "Rejected", dot: "bg-[var(--danger)]" },
];

type Props = {
  applicationId: number;
  value: ApplicationStage;
  onChanged?: (stage: ApplicationStage) => void;
};

export function StageSelect({ applicationId, value, onChanged }: Props) {
  const [current, setCurrent] = useState<ApplicationStage>(value);
  const [saving, setSaving] = useState(false);

  async function handleChange(next: ApplicationStage) {
    if (next === current) return;
    const prev = current;
    setCurrent(next);
    setSaving(true);
    try {
      const res = await fetch(`/api/applications/${applicationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: next }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`PATCH ${res.status}: ${text.slice(0, 120)}`);
      }
      onChanged?.(next);
    } catch (err) {
      setCurrent(prev);
      toast.error(err instanceof Error ? err.message : "Failed to update stage");
    } finally {
      setSaving(false);
    }
  }

  const active = STAGES.find((s) => s.value === current) ?? STAGES[0];

  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <span className={`h-2 w-2 rounded-full ${active.dot}`} aria-hidden />
      <select
        value={current}
        disabled={saving}
        onChange={(e) => handleChange(e.target.value as ApplicationStage)}
        className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)] disabled:opacity-50"
      >
        {STAGES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
    </label>
  );
}
