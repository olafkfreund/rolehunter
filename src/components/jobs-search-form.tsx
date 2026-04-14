"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Source = "jsearch" | "linkedin" | "both";

type SingleSourceResponse = {
  quota?: { remaining?: number | null } | null;
  cached?: boolean;
  count?: number;
  error?: string;
};

type BothSourceResponse = {
  quota?: {
    jsearch?: { remaining?: number | null } | null;
    linkedin?: { remaining?: number | null } | null;
  } | null;
  cached?: { jsearch?: boolean; linkedin?: boolean } | null;
  count?: number;
  errors?: Record<string, string>;
  error?: string;
};

const input =
  "w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]";

const pillBase =
  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50";

function pillClass(active: boolean) {
  return `${pillBase} ${
    active
      ? "bg-[var(--foreground)] text-[var(--background)]"
      : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
  }`;
}

function parseJson<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function JobsSearchForm() {
  const router = useRouter();
  const [source, setSource] = useState<Source>("both");
  const [q, setQ] = useState("");
  const [location, setLocation] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [quota, setQuota] = useState<{
    jsearch?: number | null;
    linkedin?: number | null;
  }>({});
  const [pending, startTransition] = useTransition();

  const busy = pending;

  function buildUrl(src: Source, query: string, loc: string): string {
    const trimmedQ = query.trim();
    const trimmedLoc = loc.trim();
    if (src === "jsearch") {
      const combined = trimmedLoc ? `${trimmedQ} ${trimmedLoc}` : trimmedQ;
      return `/api/jobs/search?q=${encodeURIComponent(combined)}&page=1`;
    }
    if (src === "linkedin") {
      return `/api/jobs/search/linkedin?q=${encodeURIComponent(trimmedQ)}&location=${encodeURIComponent(trimmedLoc)}&page=1`;
    }
    return `/api/jobs/search/both?q=${encodeURIComponent(trimmedQ)}&location=${encodeURIComponent(trimmedLoc)}&page=1`;
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = q.trim();
    if (!trimmed) return;
    setErr(null);
    setMsg(null);
    const url = buildUrl(source, q, location);
    const currentSource = source;
    startTransition(async () => {
      try {
        const res = await fetch(url, { method: "GET" });
        const text = await res.text();
        if (currentSource === "both") {
          const json = parseJson<BothSourceResponse>(text);
          if (!res.ok || !json) {
            throw new Error(json?.error ?? `Search failed (${res.status})`);
          }
          const jsRem = json.quota?.jsearch?.remaining;
          const liRem = json.quota?.linkedin?.remaining;
          setQuota((prev) => ({
            jsearch: jsRem === undefined ? prev.jsearch : jsRem,
            linkedin: liRem === undefined ? prev.linkedin : liRem,
          }));
          setMsg(`Fetched ${json.count ?? 0} jobs`);
        } else {
          const json = parseJson<SingleSourceResponse>(text);
          if (!res.ok || !json) {
            throw new Error(json?.error ?? `Search failed (${res.status})`);
          }
          const remaining = json.quota?.remaining;
          if (remaining !== undefined) {
            setQuota((prev) => ({
              ...prev,
              [currentSource]: remaining,
            }));
          }
          setMsg(`Fetched ${json.count ?? 0} jobs`);
        }
        router.refresh();
      } catch (error) {
        setErr(error instanceof Error ? error.message : "Search failed");
      }
    });
  }

  const quotaParts: string[] = [];
  if (quota.jsearch !== undefined && quota.jsearch !== null) {
    quotaParts.push(`JSearch: ${quota.jsearch}`);
  }
  if (quota.linkedin !== undefined && quota.linkedin !== null) {
    quotaParts.push(`LinkedIn: ${quota.linkedin}`);
  }
  const quotaLine = quotaParts.length > 0 ? `Quota — ${quotaParts.join(" · ")}` : null;

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3 rounded-lg border border-[var(--border)] p-4"
    >
      <div className="flex items-center justify-between gap-4">
        <h3 className="font-semibold">Search jobs</h3>
        <div className="inline-flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 p-1">
          <button
            type="button"
            disabled={busy}
            onClick={() => setSource("jsearch")}
            className={pillClass(source === "jsearch")}
          >
            JSearch
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setSource("linkedin")}
            className={pillClass(source === "linkedin")}
          >
            LinkedIn
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setSource("both")}
            className={pillClass(source === "both")}
          >
            Both
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className={input}
          placeholder="Search e.g. Senior DevOps"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <input
          className={input}
          placeholder="Location (optional, used by LinkedIn)"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
        <button
          type="submit"
          disabled={busy || q.trim().length === 0}
          className="rounded-md bg-[var(--foreground)] px-4 py-2 text-sm font-medium text-[var(--background)] disabled:opacity-50"
        >
          {busy ? "Searching…" : "Search"}
        </button>
      </div>
      {quotaLine && (
        <div className="text-xs text-[var(--muted-foreground)]">{quotaLine}</div>
      )}
      {err && <div className="text-sm text-[var(--danger)]">{err}</div>}
      {msg && <div className="text-sm text-[var(--success)]">{msg}</div>}
    </form>
  );
}
