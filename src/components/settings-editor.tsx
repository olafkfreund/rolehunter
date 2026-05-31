"use client";

import { useEffect, useState } from "react";

interface SettingState {
  key: string;
  label: string;
  description: string;
  placeholder?: string;
  isSecret: boolean;
  hasValue: boolean;
  source: "db" | "env" | "unset";
  masked: string;
}

interface Props {
  initialStates: SettingState[];
}

export function SettingsEditor({ initialStates }: Props) {
  const [states, setStates] = useState<SettingState[]>(initialStates);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [requiresRestart, setRequiresRestart] = useState(false);

  async function reload() {
    const res = await fetch("/api/settings/runtime");
    if (res.ok) {
      const j = (await res.json()) as { states: SettingState[] };
      setStates(j.states);
    }
  }

  async function save(key: string) {
    setErr(null);
    setOk(null);
    setBusy(true);
    try {
      const res = await fetch("/api/settings/runtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value: draft }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        saved?: boolean;
        requiresRestart?: boolean;
      };
      if (!res.ok) {
        setErr(data.error ?? `Save failed (${res.status})`);
        return;
      }
      setOk(`Saved ${key}.`);
      if (data.requiresRestart) setRequiresRestart(true);
      setEditing(null);
      setDraft("");
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function startEdit(s: SettingState) {
    setEditing(s.key);
    setDraft("");
    setErr(null);
    setOk(null);
  }

  function clearValue(key: string) {
    if (
      !confirm("Clear this setting? The env-var fallback (if any) will take over after restart.")
    ) {
      return;
    }
    setDraft("");
    save(key);
  }

  return (
    <div className="space-y-3">
      {requiresRestart && (
        <div
          className="rounded-md border px-3 py-2 text-xs"
          style={{
            borderColor: "var(--warn)",
            background: "color-mix(in srgb, var(--warn) 12%, transparent)",
          }}
        >
          <strong>Restart required</strong> — saved values are written to the database, but the
          running process won't pick them up until the next container restart. Run{" "}
          <code className="font-mono">docker compose restart app</code>.
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
      {ok && !requiresRestart && (
        <div
          className="rounded-md border px-3 py-2 text-xs"
          style={{ borderColor: "var(--ok)", color: "var(--ok)" }}
        >
          {ok}
        </div>
      )}

      <ul className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-md overflow-hidden">
        {states.map((s) => (
          <li key={s.key} className="px-4 py-3 bg-[var(--bg-elev)]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ background: s.hasValue ? "var(--ok)" : "var(--fg-4)" }}
                  />
                  <span className="font-medium text-[14px]">{s.label}</span>
                  <code className="text-[10px] font-mono bg-[var(--bg-elev-2)] border border-[var(--border)] rounded px-1 py-0.5">
                    {s.key}
                  </code>
                  {s.hasValue && (
                    <span
                      className="text-[10px] uppercase tracking-wider font-mono"
                      style={{
                        color: s.source === "db" ? "var(--accent)" : "var(--fg-3)",
                      }}
                    >
                      from {s.source}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-[12px] text-[var(--fg-3)]">{s.description}</div>

                {editing === s.key ? (
                  <div className="mt-2 flex gap-2">
                    <input
                      type={s.isSecret && !reveal[s.key] ? "password" : "text"}
                      value={draft}
                      autoFocus
                      placeholder={s.placeholder ?? "(empty)"}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          save(s.key);
                        }
                        if (e.key === "Escape") {
                          setEditing(null);
                          setDraft("");
                        }
                      }}
                      className="input flex-1 font-mono text-sm"
                    />
                    {s.isSecret && (
                      <button
                        type="button"
                        onClick={() =>
                          setReveal((r) => ({ ...r, [s.key]: !r[s.key] }))
                        }
                        className="btn btn-ghost text-xs"
                      >
                        {reveal[s.key] ? "hide" : "show"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => save(s.key)}
                      disabled={busy}
                      className="btn btn-primary text-xs"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(null);
                        setDraft("");
                      }}
                      className="btn btn-ghost text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="mt-2 flex items-center gap-3 text-[12px]">
                    {s.hasValue ? (
                      <code className="font-mono text-[var(--fg-2)]">{s.masked}</code>
                    ) : (
                      <span className="text-[var(--fg-4)]">not set</span>
                    )}
                  </div>
                )}
              </div>

              {editing !== s.key && (
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => startEdit(s)}
                    className="btn btn-ghost text-xs"
                  >
                    {s.hasValue ? "Edit" : "Set"}
                  </button>
                  {s.source === "db" && (
                    <button
                      type="button"
                      onClick={() => clearValue(s.key)}
                      className="btn btn-ghost text-xs"
                      style={{ color: "var(--danger)" }}
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
