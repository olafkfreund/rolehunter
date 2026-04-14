"use client";

import type { Provider } from "@/lib/llm/types";

export function ProviderToggle({
  value,
  onChange,
  disabled,
}: {
  value: Provider;
  onChange: (p: Provider) => void;
  disabled?: boolean;
}) {
  const base =
    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50";
  return (
    <div className="inline-flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 p-1">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange("claude")}
        className={`${base} ${value === "claude" ? "bg-[var(--foreground)] text-[var(--background)]" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}
      >
        Claude
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange("gemini")}
        className={`${base} ${value === "gemini" ? "bg-[var(--foreground)] text-[var(--background)]" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}
      >
        Gemini
      </button>
    </div>
  );
}
