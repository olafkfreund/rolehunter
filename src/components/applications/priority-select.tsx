"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { ApplicationPriority } from "@/lib/repo/applications";

const PRIORITIES: {
  value: ApplicationPriority;
  label: string;
  dot: string;
}[] = [
  { value: "high", label: "High", dot: "bg-[var(--danger)]" },
  { value: "medium", label: "Medium", dot: "bg-[var(--warning)]" },
  { value: "low", label: "Low", dot: "bg-[var(--muted-foreground)]" },
];

type Props = {
  applicationId: number;
  value: ApplicationPriority;
  onChanged?: (p: ApplicationPriority) => void;
};

export function PrioritySelect({ applicationId, value, onChanged }: Props) {
  const [current, setCurrent] = useState<ApplicationPriority>(value);
  const [saving, setSaving] = useState(false);

  async function handleChange(next: ApplicationPriority) {
    if (next === current) return;
    const prev = current;
    setCurrent(next);
    setSaving(true);
    try {
      const res = await fetch(`/api/applications/${applicationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority: next }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`PATCH ${res.status}: ${text.slice(0, 120)}`);
      }
      onChanged?.(next);
    } catch (err) {
      setCurrent(prev);
      toast.error(err instanceof Error ? err.message : "Failed to update priority");
    } finally {
      setSaving(false);
    }
  }

  const active = PRIORITIES.find((p) => p.value === current) ?? PRIORITIES[1];

  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <span className={`h-2 w-2 rounded-full ${active.dot}`} aria-hidden />
      <select
        value={current}
        disabled={saving}
        onChange={(e) =>
          handleChange(e.target.value as ApplicationPriority)
        }
        className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)] disabled:opacity-50"
      >
        {PRIORITIES.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>
    </label>
  );
}
