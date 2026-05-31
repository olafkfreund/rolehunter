"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface RunResult {
  processedCount: number;
  remaining: number;
  totalOfficesWritten: number;
}

export function RefreshOfficesButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<RunResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function run() {
    setErr(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/refresh-offices", { method: "POST" });
        const data = (await res.json().catch(() => ({}))) as Partial<RunResult> & {
          error?: string;
        };
        if (!res.ok) {
          setErr(data.error ?? `HTTP ${res.status}`);
          return;
        }
        setResult({
          processedCount: data.processedCount ?? 0,
          remaining: data.remaining ?? 0,
          totalOfficesWritten: data.totalOfficesWritten ?? 0,
        });
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    });
  }

  return (
    <div className="flex items-baseline gap-3 flex-wrap">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="btn btn-ghost text-xs"
        title="Walk every company and extract office locations from your ingested job listings. Geocoded via OSM. Capped at 12 companies per click — re-click to continue."
      >
        {pending ? "Refreshing offices…" : "Refresh all offices"}
      </button>
      {result && (
        <span className="text-[11px] font-mono text-[var(--fg-3)]">
          {result.totalOfficesWritten} office
          {result.totalOfficesWritten === 1 ? "" : "s"} added across{" "}
          {result.processedCount} compan
          {result.processedCount === 1 ? "y" : "ies"}
          {result.remaining > 0 && (
            <>
              {" "}
              · <span style={{ color: "var(--warn)" }}>{result.remaining} remaining</span>
            </>
          )}
        </span>
      )}
      {err && (
        <span className="text-[11px]" style={{ color: "var(--danger)" }}>
          {err}
        </span>
      )}
    </div>
  );
}
