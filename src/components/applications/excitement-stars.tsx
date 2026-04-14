"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { toast } from "sonner";

type Props = {
  applicationId: number;
  value: number | null;
  onChanged?: (v: number | null) => void;
};

export function ExcitementStars({ applicationId, value, onChanged }: Props) {
  const [current, setCurrent] = useState<number | null>(value);
  const [saving, setSaving] = useState(false);

  async function handleClick(n: number) {
    const next = current === n ? null : n;
    const prev = current;
    setCurrent(next);
    setSaving(true);
    try {
      const res = await fetch(`/api/applications/${applicationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excitement: next }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`PATCH ${res.status}: ${text.slice(0, 120)}`);
      }
      onChanged?.(next);
    } catch (err) {
      setCurrent(prev);
      toast.error(
        err instanceof Error ? err.message : "Failed to update excitement",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="inline-flex items-center gap-0.5"
      role="group"
      aria-label="Excitement rating"
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = current !== null && n <= current;
        return (
          <button
            key={n}
            type="button"
            disabled={saving}
            onClick={() => handleClick(n)}
            aria-label={`Set excitement to ${n}`}
            className="rounded p-0.5 transition-colors hover:bg-[var(--muted)] disabled:opacity-50"
          >
            <Star
              className={`h-4 w-4 ${
                filled
                  ? "fill-[var(--warning)] text-[var(--warning)]"
                  : "text-[var(--muted-foreground)]"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}
