"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Match } from "@/lib/db/schema";
import type { Provider } from "@/lib/llm/types";
import { ProviderToggle } from "./provider-toggle";
import { MatchScorecard } from "./match-scorecard";

export function MatchPanel({ jobId }: { jobId: number }) {
  const [provider, setProvider] = useState<Provider>("claude");
  const [match, setMatch] = useState<Match | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsCv, setNeedsCv] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/match?jobId=${jobId}`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (cancelled) return;
        if (res.ok && json) {
          setMatch(json as Match);
          if (json && typeof json === "object" && "provider" in json) {
            setProvider((json as Match).provider);
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  async function onScore() {
    setBusy(true);
    setError(null);
    setNeedsCv(false);
    try {
      const res = await fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, provider }),
      });
      if (res.status === 412) {
        setNeedsCv(true);
        return;
      }
      const json = await res.json();
      if (!res.ok) {
        throw new Error(
          typeof json?.error === "string" ? json.error : "Scoring failed",
        );
      }
      setMatch(json as Match);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scoring failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 rounded-lg border border-[var(--border)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Match score</h2>
          <p className="text-xs text-[var(--muted-foreground)]">
            See how your master CV scores against this role.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ProviderToggle
            value={provider}
            onChange={setProvider}
            disabled={busy || loading}
          />
          <button
            type="button"
            onClick={onScore}
            disabled={busy || loading}
            className="rounded-md bg-[var(--foreground)] px-4 py-1.5 text-sm font-medium text-[var(--background)] disabled:opacity-50"
          >
            {busy ? "Scoring…" : match ? "Rescore" : "Score this role"}
          </button>
        </div>
      </div>

      {needsCv && (
        <div className="rounded-md border border-[var(--border)] bg-[var(--muted)]/40 p-3 text-sm text-[var(--muted-foreground)]">
          No master CV.{" "}
          <Link
            href="/profile"
            className="font-medium text-[var(--foreground)] underline"
          >
            Upload one first.
          </Link>
        </div>
      )}

      {error && <div className="text-sm text-[var(--danger)]">{error}</div>}

      {loading && (
        <div className="text-sm text-[var(--muted-foreground)]">Loading…</div>
      )}

      {!loading && !match && !error && !needsCv && (
        <div className="rounded-md border border-dashed border-[var(--border)] bg-[var(--muted)]/30 p-4 text-sm text-[var(--muted-foreground)]">
          No score yet. Choose a provider and click “Score this role”.
        </div>
      )}

      {match && (
        <MatchScorecard
          score={match.score}
          strengths={
            Array.isArray(match.strengths)
              ? (match.strengths as unknown as string[])
              : []
          }
          gaps={
            Array.isArray(match.gaps) ? (match.gaps as unknown as string[]) : []
          }
          reasoningMd={match.reasoningMd}
          provider={match.provider}
          createdAt={match.createdAt}
        />
      )}
    </section>
  );
}
