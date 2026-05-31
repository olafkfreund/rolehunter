"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PortfolioItem } from "@/lib/db/schema";
import type { PortfolioSourceSummary } from "@/lib/repo/portfolio";

type Tab = "items" | "sources" | "manual";

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

function kindLabel(kind: string): string {
  return kind.replace(/_/g, " ");
}

interface Props {
  initialItems: PortfolioItem[];
  initialSources: PortfolioSourceSummary[];
}

export function PortfolioPanel({ initialItems, initialSources }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("items");
  const [items, setItems] = useState<PortfolioItem[]>(initialItems);
  const [sources, setSources] = useState<PortfolioSourceSummary[]>(initialSources);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [itemsRes, sourcesRes] = await Promise.all([
      fetch("/api/portfolio/items"),
      fetch("/api/portfolio/sources"),
    ]);
    if (itemsRes.ok) {
      const j = (await itemsRes.json()) as { items: PortfolioItem[] };
      setItems(j.items);
    }
    if (sourcesRes.ok) {
      const j = (await sourcesRes.json()) as { sources: PortfolioSourceSummary[] };
      setSources(j.sources);
    }
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <nav className="flex gap-1 border-b border-[var(--border)]">
        {(["items", "sources", "manual"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-[13px] uppercase tracking-[0.12em] font-mono border-b-2 -mb-px transition-colors ${
              tab === t
                ? "border-[var(--accent)] text-[var(--fg)]"
                : "border-transparent text-[var(--fg-3)] hover:text-[var(--fg-2)]"
            }`}
          >
            {t === "items" && `Items · ${items.length}`}
            {t === "sources" && `Sources · ${sources.length}`}
            {t === "manual" && "Add manual"}
          </button>
        ))}
      </nav>

      {tab === "items" && <ItemsTab items={items} busy={busy} setBusy={setBusy} onChange={refresh} />}
      {tab === "sources" && (
        <SourcesTab sources={sources} busy={busy} setBusy={setBusy} onChange={refresh} />
      )}
      {tab === "manual" && <ManualTab busy={busy} setBusy={setBusy} onCreated={refresh} />}
    </div>
  );
}

function ItemsTab({
  items,
  busy,
  setBusy,
  onChange,
}: {
  items: PortfolioItem[];
  busy: boolean;
  setBusy: (b: boolean) => void;
  onChange: () => Promise<void>;
}) {
  async function toggleHidden(item: PortfolioItem) {
    setBusy(true);
    try {
      await fetch(`/api/portfolio/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hidden: !item.hidden }),
      });
      await onChange();
    } finally {
      setBusy(false);
    }
  }

  async function deleteItem(id: number) {
    if (!confirm("Delete this portfolio item? Will be re-added on next sync.")) return;
    setBusy(true);
    try {
      await fetch(`/api/portfolio/items/${id}`, { method: "DELETE" });
      await onChange();
    } finally {
      setBusy(false);
    }
  }

  if (items.length === 0) {
    return (
      <div className="card p-12 text-center">
        <div className="section-label mb-2">empty set</div>
        <div className="text-[var(--fg-3)] text-sm">
          No portfolio items yet. Go to <strong>Sources</strong> to sync GitHub/GitLab or
          <strong> Add manual</strong> to enter a project by hand.
        </div>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((it) => {
        const tech = Array.isArray(it.tech) ? (it.tech as string[]) : [];
        return (
          <li
            key={it.id}
            className={`rounded-lg border border-[var(--border)] bg-[var(--bg-elev)] p-4 ${
              it.hidden ? "opacity-50" : ""
            }`}
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
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
                  <span className="chip text-[10px] uppercase">{kindLabel(it.kind)}</span>
                  {it.stars != null && it.stars > 0 && (
                    <span className="text-xs text-[var(--fg-3)]">★ {it.stars}</span>
                  )}
                </div>
                {it.description && (
                  <div className="mt-1 line-clamp-3 text-sm text-[var(--fg-2)]">
                    {it.description.split("\n")[0]}
                  </div>
                )}
                {tech.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {tech.slice(0, 8).map((t) => (
                      <span key={t} className="chip text-[10px]">
                        {t}
                      </span>
                    ))}
                    {tech.length > 8 && (
                      <span className="text-[10px] text-[var(--fg-3)]">+{tech.length - 8}</span>
                    )}
                  </div>
                )}
                <div className="mt-2 flex flex-wrap gap-x-3 text-xs text-[var(--fg-3)]">
                  <span>synced {timeAgo(it.syncedAt)}</span>
                  <span className="text-[var(--fg-4)]">·</span>
                  <span>{it.sourceKey}</span>
                  {it.endedAt && <span>archived {timeAgo(it.endedAt)}</span>}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => toggleHidden(it)}
                  disabled={busy}
                  className="btn btn-ghost text-xs"
                >
                  {it.hidden ? "Show" : "Hide"}
                </button>
                <button
                  type="button"
                  onClick={() => deleteItem(it.id)}
                  disabled={busy}
                  className="btn btn-ghost text-xs"
                  style={{ color: "var(--danger)" }}
                >
                  Delete
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function SourcesTab({
  sources,
  busy,
  setBusy,
  onChange,
}: {
  sources: PortfolioSourceSummary[];
  busy: boolean;
  setBusy: (b: boolean) => void;
  onChange: () => Promise<void>;
}) {
  const [gh, setGh] = useState("");
  const [gl, setGl] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function sync(kind: "github" | "gitlab", username: string) {
    setErr(null);
    setOk(null);
    if (!username.trim()) {
      setErr(`Enter a ${kind} username`);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/portfolio/sync-${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), includeReadmes: true, limit: 50 }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        fetched?: number;
        inserted?: number;
        updated?: number;
      };
      if (!res.ok) {
        setErr(data.error ?? `Sync failed (${res.status})`);
        return;
      }
      setOk(`Synced ${data.fetched} ${kind} repos — ${data.inserted} new, ${data.updated} updated`);
      await onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function removeSource(sourceKey: string) {
    if (
      !confirm(
        `Delete every portfolio item from "${sourceKey}"? Re-syncing the same source brings them back.`,
      )
    )
      return;
    setBusy(true);
    try {
      await fetch(`/api/portfolio/sources?sourceKey=${encodeURIComponent(sourceKey)}`, {
        method: "DELETE",
      });
      await onChange();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sync("github", gh);
          }}
          className="card p-4 space-y-3"
        >
          <div className="section-label">GitHub</div>
          <div className="flex gap-2">
            <input
              value={gh}
              onChange={(e) => setGh(e.target.value)}
              placeholder="github-username"
              className="input flex-1 font-mono text-sm"
            />
            <button type="submit" disabled={busy} className="btn btn-primary text-sm">
              Sync
            </button>
          </div>
          <div className="text-[10px] text-[var(--fg-4)]">
            Public repos. Set <code>GITHUB_TOKEN</code> to raise the rate limit.
          </div>
        </form>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            sync("gitlab", gl);
          }}
          className="card p-4 space-y-3"
        >
          <div className="section-label">GitLab</div>
          <div className="flex gap-2">
            <input
              value={gl}
              onChange={(e) => setGl(e.target.value)}
              placeholder="gitlab-username"
              className="input flex-1 font-mono text-sm"
            />
            <button type="submit" disabled={busy} className="btn btn-primary text-sm">
              Sync
            </button>
          </div>
          <div className="text-[10px] text-[var(--fg-4)]">
            Public projects. Set <code>GITLAB_TOKEN</code> and{" "}
            <code>GITLAB_BASE_URL</code> for self-hosted instances.
          </div>
        </form>
      </div>

      {err && (
        <div className="rounded-md border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-xs">
          {err}
        </div>
      )}
      {ok && (
        <div className="rounded-md border border-[var(--ok)]/40 bg-[var(--ok)]/10 px-3 py-2 text-xs">
          {ok}
        </div>
      )}

      <div className="space-y-2">
        <div className="section-label">Connected sources · {sources.length}</div>
        {sources.length === 0 ? (
          <div className="card p-8 text-center text-sm text-[var(--fg-3)]">
            No sources yet. Sync GitHub or GitLab above, or use <strong>Add manual</strong>.
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-md overflow-hidden">
            {sources.map((s) => (
              <li
                key={s.sourceKey}
                className="flex items-center justify-between gap-3 px-4 py-3 bg-[var(--bg-elev)]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm">{s.sourceKey}</span>
                    <span className="chip text-[10px] uppercase">{kindLabel(s.kind)}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-[var(--fg-3)]">
                    <span className="mono">{s.itemCount}</span> items
                    {s.hiddenCount > 0 && <> · {s.hiddenCount} hidden</>}
                    {s.lastSyncedAt && <> · synced {timeAgo(s.lastSyncedAt)}</>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeSource(s.sourceKey)}
                  disabled={busy}
                  className="btn btn-ghost text-xs"
                  style={{ color: "var(--danger)" }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ManualTab({
  busy,
  setBusy,
  onCreated,
}: {
  busy: boolean;
  setBusy: (b: boolean) => void;
  onCreated: () => Promise<void>;
}) {
  const [kind, setKind] = useState<"manual_project" | "manual_skill" | "manual_role">(
    "manual_project",
  );
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [tech, setTech] = useState("");
  const [highlights, setHighlights] = useState("");
  const [role, setRole] = useState("");
  const [startedAt, setStartedAt] = useState("");
  const [endedAt, setEndedAt] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setOk(null);
    if (!title.trim()) {
      setErr("Title required");
      return;
    }
    setBusy(true);
    try {
      const body = {
        kind,
        title: title.trim(),
        description: description.trim(),
        url: url.trim() || null,
        tech: tech
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        highlights: highlights
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        role: role.trim() || null,
        startedAt: startedAt || null,
        endedAt: endedAt || null,
      };
      const res = await fetch("/api/portfolio/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErr(data.error ?? `Create failed (${res.status})`);
        return;
      }
      setOk(`Added "${title.trim()}"`);
      setTitle("");
      setDescription("");
      setUrl("");
      setTech("");
      setHighlights("");
      setRole("");
      setStartedAt("");
      setEndedAt("");
      await onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const isRole = kind === "manual_role";
  const isProject = kind === "manual_project";

  return (
    <form onSubmit={submit} className="card p-5 space-y-4 max-w-2xl">
      <div className="section-label">Add manual entry</div>

      <div>
        <label className="text-[11px] text-[var(--fg-3)] uppercase tracking-wider">Kind</label>
        <div className="mt-1 flex gap-1">
          {(
            [
              ["manual_project", "Project"],
              ["manual_skill", "Skill"],
              ["manual_role", "Role"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                kind === k
                  ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--fg)]"
                  : "border-[var(--border)] text-[var(--fg-3)] hover:text-[var(--fg-2)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-[11px] text-[var(--fg-3)] uppercase tracking-wider">Title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="input w-full mt-1"
          placeholder={
            isRole
              ? "Senior Platform Engineer @ Acme"
              : isProject
                ? "Self-hosted PaaS for internal teams"
                : "Kubernetes operator development"
          }
        />
      </div>

      <div>
        <label className="text-[11px] text-[var(--fg-3)] uppercase tracking-wider">
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className="input w-full mt-1 font-mono text-sm"
          placeholder="Short markdown blurb. What it does, why it matters."
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] text-[var(--fg-3)] uppercase tracking-wider">URL</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="input w-full mt-1 font-mono text-sm"
            placeholder="https://…"
          />
        </div>
        {isRole && (
          <div>
            <label className="text-[11px] text-[var(--fg-3)] uppercase tracking-wider">
              Role / title
            </label>
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="input w-full mt-1"
              placeholder="Staff Engineer"
            />
          </div>
        )}
      </div>

      <div>
        <label className="text-[11px] text-[var(--fg-3)] uppercase tracking-wider">
          Tech (comma-separated)
        </label>
        <input
          value={tech}
          onChange={(e) => setTech(e.target.value)}
          className="input w-full mt-1 font-mono text-sm"
          placeholder="kubernetes, terraform, go, rust"
        />
      </div>

      <div>
        <label className="text-[11px] text-[var(--fg-3)] uppercase tracking-wider">
          Highlights (one per line)
        </label>
        <textarea
          value={highlights}
          onChange={(e) => setHighlights(e.target.value)}
          rows={3}
          className="input w-full mt-1 font-mono text-sm"
          placeholder="Reduced deploy time from 30m to 4m&#10;Handled 200rps peak traffic"
        />
      </div>

      {(isRole || isProject) && (
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-[var(--fg-3)] uppercase tracking-wider">
              Started
            </label>
            <input
              type="month"
              value={startedAt}
              onChange={(e) => setStartedAt(e.target.value)}
              className="input w-full mt-1 font-mono text-sm"
            />
          </div>
          <div>
            <label className="text-[11px] text-[var(--fg-3)] uppercase tracking-wider">Ended</label>
            <input
              type="month"
              value={endedAt}
              onChange={(e) => setEndedAt(e.target.value)}
              className="input w-full mt-1 font-mono text-sm"
            />
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={busy} className="btn btn-primary text-sm">
          {busy ? "Adding…" : "Add entry"}
        </button>
        {err && <span className="text-xs" style={{ color: "var(--danger)" }}>{err}</span>}
        {ok && <span className="text-xs" style={{ color: "var(--ok)" }}>{ok}</span>}
      </div>
    </form>
  );
}
