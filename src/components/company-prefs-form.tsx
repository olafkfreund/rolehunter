"use client";

import { useState, useTransition } from "react";

export const BENEFITS = [
  { key: "401k", label: "401(k) match" },
  { key: "pension", label: "Pension (UK / EU)" },
  { key: "equity", label: "Equity / RSU" },
  { key: "bonus", label: "Bonus structure" },
  { key: "health", label: "Health insurance" },
  { key: "dental", label: "Dental" },
  { key: "vision", label: "Vision" },
  { key: "pto", label: "PTO / vacation" },
  { key: "parental", label: "Parental leave" },
  { key: "stipend", label: "Remote stipend" },
  { key: "wellness", label: "Wellness budget" },
  { key: "learning", label: "Learning budget" },
  { key: "espp", label: "ESPP" },
  { key: "commuter", label: "Commuter benefits" },
] as const;

type TransportMode = "car" | "transit" | "bike" | "walk" | "any";

interface Props {
  initialMaxCommuteMinutes: number | null;
  initialTransportMode: TransportMode;
  initialBenefitPriorities: string[];
}

export function CompanyPrefsForm({
  initialMaxCommuteMinutes,
  initialTransportMode,
  initialBenefitPriorities,
}: Props) {
  const [maxCommute, setMaxCommute] = useState<number | null>(initialMaxCommuteMinutes);
  const [mode, setMode] = useState<TransportMode>(initialTransportMode);
  const [priorities, setPriorities] = useState<string[]>(initialBenefitPriorities);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function togglePriority(k: string) {
    setPriorities((prev) =>
      prev.includes(k) ? prev.filter((p) => p !== k) : [...prev, k],
    );
  }

  function movePriority(k: string, direction: -1 | 1) {
    setPriorities((prev) => {
      const i = prev.indexOf(k);
      if (i < 0) return prev;
      const j = i + direction;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function save() {
    setErr(null);
    setStatus("idle");
    startTransition(async () => {
      try {
        const res = await fetch("/api/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            maxCommuteMinutes: maxCommute,
            preferredTransportMode: mode,
            benefitPriorities: priorities,
          }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: unknown };
          throw new Error(typeof j.error === "string" ? j.error : `HTTP ${res.status}`);
        }
        setStatus("saved");
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
        setStatus("error");
      }
    });
  }

  const unranked = BENEFITS.filter((b) => !priorities.includes(b.key));

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-[var(--border)] p-5 space-y-4">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <h2 className="font-semibold">Commute</h2>
          <span className="text-[11px] text-[var(--fg-3)] font-mono">
            powers Logistics dimension
          </span>
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-wider text-[var(--fg-3)]">
            Max acceptable commute (one way, in minutes)
          </label>
          <input
            type="number"
            min={0}
            max={600}
            value={maxCommute ?? ""}
            placeholder="45"
            onChange={(e) =>
              setMaxCommute(e.target.value === "" ? null : Number(e.target.value))
            }
            className="block mt-1 w-32 input font-mono text-sm"
          />
          <div className="text-[10px] text-[var(--fg-4)] mt-1">
            Leave empty if you don't have a hard cap.
          </div>
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-wider text-[var(--fg-3)]">
            Preferred transport mode
          </label>
          <div className="flex gap-1 mt-1 flex-wrap">
            {(["car", "transit", "bike", "walk", "any"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                  mode === m
                    ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--fg)]"
                    : "border-[var(--border)] text-[var(--fg-3)] hover:text-[var(--fg-2)]"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-[var(--border)] p-5 space-y-4">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <h2 className="font-semibold">Benefits priorities</h2>
          <span className="text-[11px] text-[var(--fg-3)] font-mono">
            ordered — top is most important
          </span>
        </div>
        <p className="text-[12px] text-[var(--fg-3)]">
          Click to add to your ordered list. Re-order with the arrows.
        </p>

        {priorities.length > 0 && (
          <ol className="space-y-1.5">
            {priorities.map((k, idx) => {
              const meta = BENEFITS.find((b) => b.key === k);
              return (
                <li
                  key={k}
                  className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-elev)] px-3 py-2"
                >
                  <span className="font-mono text-[11px] text-[var(--fg-3)] w-6">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <span className="flex-1 text-[13px]">{meta?.label ?? k}</span>
                  <button
                    type="button"
                    onClick={() => movePriority(k, -1)}
                    disabled={idx === 0}
                    className="btn btn-ghost text-[10px] disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => movePriority(k, 1)}
                    disabled={idx === priorities.length - 1}
                    className="btn btn-ghost text-[10px] disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => togglePriority(k)}
                    className="btn btn-ghost text-[10px]"
                    style={{ color: "var(--danger)" }}
                  >
                    remove
                  </button>
                </li>
              );
            })}
          </ol>
        )}

        {unranked.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {unranked.map((b) => (
              <button
                key={b.key}
                type="button"
                onClick={() => togglePriority(b.key)}
                className="inline-flex items-baseline gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-elev)] px-2.5 py-1 text-[12px] hover:bg-[var(--bg-elev-2)]"
              >
                <span className="font-mono text-[10px] text-[var(--fg-3)]">+</span>
                {b.label}
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="btn btn-primary text-sm"
        >
          {pending ? "Saving…" : "Save preferences"}
        </button>
        {status === "saved" && (
          <span className="text-xs" style={{ color: "var(--ok)" }}>
            ✓ saved
          </span>
        )}
        {status === "error" && err && (
          <span className="text-xs" style={{ color: "var(--danger)" }}>
            {err}
          </span>
        )}
      </div>
    </div>
  );
}
