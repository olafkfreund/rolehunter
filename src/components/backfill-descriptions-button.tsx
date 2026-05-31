"use client";

import { useEffect, useState, useTransition } from "react";

interface Counts {
  total: number;
  bySource: Record<string, number>;
}

interface RunResult {
  scanned: number;
  filled: number;
  failed: number;
  skipped: number;
  remaining: number;
}

/**
 * Empty-description backfill. Shows current count, lets the user run a
 * batch, then re-renders the count. Re-clickable until remaining hits 0.
 */
export function BackfillDescriptionsButton() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    try {
      const res = await fetch("/api/admin/backfill-descriptions");
      if (res.ok) setCounts((await res.json()) as Counts);
    } catch {
      // ignored
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  function run() {
    setErr(null);
    setResult(null);
    startTransition(async () => {
      try {
        const res = await fetch(
          "/api/admin/backfill-descriptions?limit=25",
          { method: "POST" },
        );
        const data = (await res.json().catch(() => ({}))) as
          | (RunResult & { error?: string })
          | { error?: string };
        if (!res.ok) {
          setErr(("error" in data && typeof data.error === "string") ? data.error : `HTTP ${res.status}`);
          return;
        }
        setResult(data as RunResult);
        refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    });
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <div className="font-medium text-[14px]">Backfill missing job descriptions</div>
          <p className="text-[12px] text-[var(--fg-3)] mt-0.5">
            LinkedIn + JobSpy ingest only the listing card on the search response.
            The full description requires a second fetch per row. This sweeps
            every empty-description row and fills the body so the role-fit
            Skills dimension can actually classify them.
          </p>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={pending || counts?.total === 0}
          className="btn btn-primary text-xs shrink-0"
        >
          {pending ? "Filling…" : "Run a batch (25)"}
        </button>
      </div>

      {counts !== null && (
        <div className="text-[11px] font-mono text-[var(--fg-3)]">
          {counts.total === 0 ? (
            <span style={{ color: "var(--ok)" }}>✓ no empty-description jobs</span>
          ) : (
            <>
              <span style={{ color: "var(--warn)" }}>
                {counts.total.toLocaleString()} empty
              </span>{" "}
              ·{" "}
              {Object.entries(counts.bySource)
                .map(([k, v]) => `${k}=${v}`)
                .join(", ")}
            </>
          )}
        </div>
      )}

      {result && (
        <div
          className="rounded-md border px-3 py-2 text-xs"
          style={{
            borderColor: "var(--ok)",
            background: "color-mix(in srgb, var(--ok) 8%, transparent)",
          }}
        >
          Scanned {result.scanned} · filled <strong>{result.filled}</strong>
          {result.skipped > 0 && ` · skipped ${result.skipped}`}
          {result.failed > 0 && ` · failed ${result.failed}`} ·{" "}
          {result.remaining > 0 ? (
            <>
              {result.remaining.toLocaleString()} remaining — click again
            </>
          ) : (
            <span style={{ color: "var(--ok)" }}>done</span>
          )}
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
    </div>
  );
}
