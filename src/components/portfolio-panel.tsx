"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PortfolioItem } from "@/lib/db/schema";

function timeAgo(iso: string | Date | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diff = Date.now() - then;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 30 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  if (diff < 365 * 86_400_000) return `${Math.floor(diff / (30 * 86_400_000))}mo ago`;
  return `${Math.floor(diff / (365 * 86_400_000))}y ago`;
}

export function PortfolioPanel({ initialItems }: { initialItems: PortfolioItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState<PortfolioItem[]>(initialItems);
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function syncGithub(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus(null);
    if (!username.trim()) {
      setError("Enter a GitHub username");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/portfolio/sync-github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), includeReadmes: true, limit: 50 }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setError(err.error ?? `Sync failed (${res.status})`);
        return;
      }
      const data = (await res.json()) as { fetched: number; inserted: number; updated: number };
      setStatus(
        `Synced ${data.fetched} repos — ${data.inserted} new, ${data.updated} updated`,
      );
      await refresh();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    const res = await fetch("/api/portfolio/items");
    if (res.ok) {
      const json = (await res.json()) as { items: PortfolioItem[] };
      setItems(json.items);
    }
  }

  async function toggleHidden(item: PortfolioItem) {
    setBusy(true);
    try {
      await fetch(`/api/portfolio/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hidden: !item.hidden }),
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function deleteItem(id: number) {
    if (!confirm("Delete this portfolio item? Will be re-added on next sync.")) return;
    setBusy(true);
    try {
      await fetch(`/api/portfolio/items/${id}`, { method: "DELETE" });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={syncGithub}
        className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--muted)]/30 p-4"
      >
        <div className="text-sm font-medium">Sync from GitHub</div>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="github-username"
            className="flex-1 min-w-[200px] rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm font-mono"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-[var(--foreground)] px-3 py-1.5 text-sm font-medium text-[var(--background)] hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Syncing…" : "Sync repos"}
          </button>
        </div>
        <div className="text-[10px] text-[var(--muted-foreground)]">
          Public repos only. Set <code>GITHUB_TOKEN</code> env to raise the 60/hr rate limit to 5000/hr.
        </div>
        {error && (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}
        {status && (
          <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
            {status}
          </div>
        )}
      </form>

      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold tracking-tight">
          Items <span className="text-sm font-normal text-[var(--muted-foreground)]">({items.length})</span>
        </h2>
        {items.length > 0 && (
          <span className="text-xs text-[var(--muted-foreground)]">
            {items.filter((i) => !i.hidden).length} visible · {items.filter((i) => i.hidden).length} hidden
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted-foreground)]">
          No portfolio items yet. Sync from GitHub above to populate.
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => {
            const tech = Array.isArray(it.tech) ? (it.tech as string[]) : [];
            return (
              <li
                key={it.id}
                className={`rounded-lg border border-[var(--border)] bg-[var(--background)] p-4 ${
                  it.hidden ? "opacity-50" : ""
                }`}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {it.url ? (
                        <a
                          href={it.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold hover:underline"
                        >
                          {it.title}
                        </a>
                      ) : (
                        <span className="font-semibold">{it.title}</span>
                      )}
                      <span className="rounded-full border border-[var(--border)] bg-[var(--muted)]/50 px-1.5 py-0.5 text-[10px] uppercase">
                        {it.kind.replace(/_/g, " ")}
                      </span>
                      {it.stars != null && it.stars > 0 && (
                        <span className="text-xs text-[var(--muted-foreground)]">
                          ★ {it.stars}
                        </span>
                      )}
                    </div>
                    {it.description && (
                      <div className="mt-1 line-clamp-3 text-sm text-[var(--muted-foreground)]">
                        {it.description.split("\n")[0]}
                      </div>
                    )}
                    {tech.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {tech.slice(0, 8).map((t) => (
                          <span
                            key={t}
                            className="rounded-full border border-[var(--border)] bg-[var(--muted)]/30 px-1.5 py-0.5 text-[10px]"
                          >
                            {t}
                          </span>
                        ))}
                        {tech.length > 8 && (
                          <span className="text-[10px] text-[var(--muted-foreground)]">
                            +{tech.length - 8}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap gap-x-3 text-xs text-[var(--muted-foreground)]">
                      <span>synced {timeAgo(it.syncedAt)}</span>
                      {it.endedAt && <span>archived {timeAgo(it.endedAt)}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => toggleHidden(it)}
                      disabled={busy}
                      className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs hover:bg-[var(--muted)] disabled:opacity-50"
                    >
                      {it.hidden ? "Show" : "Hide"}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteItem(it.id)}
                      disabled={busy}
                      className="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs text-red-300 hover:bg-red-500/20 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
