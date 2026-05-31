"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const PRESETS: Array<{ label: string; needle: string }> = [
  { label: "USA (any US tag)", needle: ", US" },
  { label: "United States", needle: "United States" },
  { label: "India", needle: "India" },
  { label: "United Kingdom", needle: "United Kingdom" },
  { label: "London", needle: "London" },
  { label: "Germany", needle: "Germany" },
];

interface Action {
  key: string;
  label: string;
  description: string;
  expectedPhrase: string;
  needsLocation?: boolean;
}

const ACTIONS: Action[] = [
  {
    key: "jobs_in_zone",
    label: "Delete jobs by location",
    description:
      "Hard-delete every job whose location string contains the given substring. Use a preset (USA, India, …) or type any free-text fragment.",
    expectedPhrase: "DELETE JOBS IN ZONE",
    needsLocation: true,
  },
  {
    key: "hidden_jobs",
    label: "Delete hidden jobs",
    description:
      "Hard-delete every job you've marked hidden. Use this to clean out the soft-deleted backlog.",
    expectedPhrase: "DELETE HIDDEN JOBS",
  },
  {
    key: "all_jobs",
    label: "Delete ALL jobs",
    description:
      "Hard-delete every job listing. Matches, applications, and cached scores cascade away.",
    expectedPhrase: "DELETE ALL JOBS",
  },
  {
    key: "all_portfolio",
    label: "Delete ALL portfolio items",
    description: "Wipe every imported repo, blog, manual entry. Re-sync from /portfolio to rebuild.",
    expectedPhrase: "DELETE ALL PORTFOLIO",
  },
  {
    key: "all_applications",
    label: "Delete ALL applications",
    description: "Wipe every application + variant + interview row. Jobs remain.",
    expectedPhrase: "DELETE ALL APPLICATIONS",
  },
  {
    key: "all_companies",
    label: "Delete ALL companies",
    description:
      "Wipe every enriched company (offices, news, layoffs, benefits cascade). Jobs remain unlinked.",
    expectedPhrase: "DELETE ALL COMPANIES",
  },
  {
    key: "full_reset",
    label: "RESET EVERYTHING",
    description:
      "Wipe every user-data table. Profile row stays but every field is blanked. Use this to start a fresh job search with a new identity.",
    expectedPhrase: "RESET EVERYTHING",
  },
];

export function DangerZone() {
  const router = useRouter();
  const [openAction, setOpenAction] = useState<string | null>(null);
  const [phrase, setPhrase] = useState("");
  const [needle, setNeedle] = useState<string>(", US");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function reset() {
    setOpenAction(null);
    setPhrase("");
    setErr(null);
  }

  function execute(action: Action) {
    setErr(null);
    setResult(null);
    if (phrase !== action.expectedPhrase) {
      setErr(`Type "${action.expectedPhrase}" exactly to confirm.`);
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/danger", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: action.key,
            confirmPhrase: phrase,
            payload: action.needsLocation ? { locationSubstring: needle } : undefined,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (!res.ok) {
          setErr(
            typeof data.error === "string" ? data.error : `HTTP ${res.status}`,
          );
          return;
        }
        if (data.counts) {
          setResult(
            `Wiped: ${Object.entries(data.counts)
              .map(([k, v]) => `${k}=${v}`)
              .join(", ")}`,
          );
        } else if (typeof data.removed === "number") {
          setResult(
            `Removed ${data.removed.toLocaleString()} row${data.removed === 1 ? "" : "s"}${
              data.zone ? ` (zone: ${data.zone})` : ""
            }.`,
          );
        }
        reset();
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    });
  }

  return (
    <section
      className="rounded-lg border p-4 space-y-3"
      style={{
        borderColor: "color-mix(in srgb, var(--danger) 45%, var(--border))",
        background: "color-mix(in srgb, var(--danger) 4%, transparent)",
      }}
    >
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h2 className="text-lg font-semibold tracking-tight" style={{ color: "var(--danger)" }}>
          Danger zone
        </h2>
        <span className="text-[11px] font-mono text-[var(--fg-3)]">
          irreversible bulk deletions
        </span>
      </div>
      <p className="text-[12px] text-[var(--fg-3)]">
        Hard-deletes — no undo. Each action requires you to type a confirmation phrase.
        Cascading FKs mean wiping jobs also wipes matches, applications, interviews,
        and cached scores tied to those jobs.
      </p>

      {result && (
        <div
          className="rounded-md border px-3 py-2 text-xs"
          style={{
            borderColor: "var(--ok)",
            background: "color-mix(in srgb, var(--ok) 8%, transparent)",
            color: "var(--ok)",
          }}
        >
          ✓ {result}
        </div>
      )}
      {err && (
        <div
          className="rounded-md border px-3 py-2 text-xs"
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
        >
          {err}
        </div>
      )}

      <ul className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-md overflow-hidden">
        {ACTIONS.map((a) => {
          const open = openAction === a.key;
          return (
            <li key={a.key} className="bg-[var(--bg-elev)] px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium">{a.label}</div>
                  <div className="mt-0.5 text-[12px] text-[var(--fg-3)]">
                    {a.description}
                  </div>
                </div>
                {!open ? (
                  <button
                    type="button"
                    onClick={() => {
                      setOpenAction(a.key);
                      setPhrase("");
                      setErr(null);
                    }}
                    className="btn btn-ghost text-xs shrink-0"
                    style={{ color: "var(--danger)" }}
                  >
                    Open…
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={reset}
                    className="btn btn-ghost text-xs shrink-0"
                  >
                    Cancel
                  </button>
                )}
              </div>

              {open && (
                <div className="mt-3 space-y-2">
                  {a.needsLocation && (
                    <div className="space-y-2">
                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-[var(--fg-3)]">
                          Location substring (case-insensitive)
                        </label>
                        <input
                          value={needle}
                          onChange={(e) => setNeedle(e.target.value)}
                          placeholder=", US"
                          className="input w-full mt-1 font-mono text-sm"
                        />
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {PRESETS.map((p) => (
                          <button
                            key={p.label}
                            type="button"
                            onClick={() => setNeedle(p.needle)}
                            className="px-2 py-1 text-[10px] rounded-md border border-[var(--border)] bg-[var(--bg-elev)] hover:bg-[var(--bg-elev-2)]"
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-[var(--fg-3)]">
                      Type{" "}
                      <code className="font-mono text-[11px] text-[var(--danger)]">
                        {a.expectedPhrase}
                      </code>{" "}
                      to confirm
                    </label>
                    <input
                      type="text"
                      value={phrase}
                      onChange={(e) => setPhrase(e.target.value)}
                      placeholder={a.expectedPhrase}
                      className="input w-full mt-1 font-mono text-sm"
                      autoFocus
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => execute(a)}
                    disabled={pending || phrase !== a.expectedPhrase}
                    className="btn text-sm"
                    style={{
                      background:
                        phrase === a.expectedPhrase
                          ? "var(--danger)"
                          : "var(--bg-elev-2)",
                      color: phrase === a.expectedPhrase ? "var(--bg)" : "var(--fg-4)",
                      borderColor: "var(--danger)",
                    }}
                  >
                    {pending ? "Working…" : a.label}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
