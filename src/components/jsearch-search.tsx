"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const input =
  "w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]";

type SearchResponse = {
  quota?: { remaining: number | null };
  cached?: boolean;
  count?: number;
  error?: string;
};

export function JSearchSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [quota, setQuota] = useState<string>("—");
  const [status, setStatus] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setErr(null);
    setStatus(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/jobs/search?q=${encodeURIComponent(q)}`, {
          method: "GET",
        });
        const json = (await res.json().catch(() => null)) as SearchResponse | null;
        if (res.status === 501) {
          setErr(json?.error ?? "JSearch is not configured.");
          return;
        }
        if (!res.ok || !json) {
          throw new Error(json?.error ?? `Search failed (${res.status})`);
        }
        if (json.quota && json.quota.remaining !== null && json.quota.remaining !== undefined) {
          setQuota(String(json.quota.remaining));
        } else if (json.cached) {
          setQuota((prev) => prev); // leave as-is for cached
        }
        setStatus(
          json.cached
            ? `Cached · ${json.count ?? 0} result${json.count === 1 ? "" : "s"}`
            : `Fetched · ${json.count ?? 0} result${json.count === 1 ? "" : "s"}`,
        );
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Search failed");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-lg border border-[var(--border)] p-4">
      <div className="flex items-center justify-between gap-4">
        <h3 className="font-semibold">Search JSearch</h3>
        <span className="text-xs text-[var(--muted-foreground)]">Quota: {quota}</span>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className={input}
          placeholder="e.g. Senior platform engineer remote"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="submit"
          disabled={pending || query.trim().length === 0}
          className="rounded-md bg-[var(--foreground)] px-4 py-2 text-sm font-medium text-[var(--background)] disabled:opacity-50"
        >
          {pending ? "Searching…" : "Search"}
        </button>
      </div>
      {status && <div className="text-xs text-[var(--muted-foreground)]">{status}</div>}
      {err && <div className="text-sm text-[var(--danger)]">{err}</div>}
    </form>
  );
}
