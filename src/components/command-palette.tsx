"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface CommandAction {
  id: string;
  label: string;
  hint?: string;
  shortcut?: string;
  run: () => void | Promise<void>;
  group: string;
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const actions: CommandAction[] = [
    { id: "go-dashboard", label: "Go to Dashboard", group: "Navigate", shortcut: "G D", run: () => router.push("/") },
    { id: "go-jobs", label: "Go to Jobs", group: "Navigate", shortcut: "G J", run: () => router.push("/jobs") },
    { id: "go-search", label: "Go to Searches", group: "Navigate", shortcut: "G S", run: () => router.push("/search") },
    { id: "go-portfolio", label: "Go to Portfolio", group: "Navigate", shortcut: "G P", run: () => router.push("/portfolio") },
    { id: "go-apps", label: "Go to Applications", group: "Navigate", run: () => router.push("/applications") },
    { id: "go-interviews", label: "Go to Interviews", group: "Navigate", run: () => router.push("/interviews") },
    { id: "go-gaps", label: "Go to Gaps", group: "Navigate", run: () => router.push("/gaps") },
    { id: "go-profile", label: "Go to Profile", group: "Navigate", run: () => router.push("/profile") },

    { id: "new-search", label: "New saved search", hint: "Create a new search profile", group: "Create", run: () => router.push("/search") },
    { id: "sync-github", label: "Sync GitHub portfolio", hint: "Pull your public repos", group: "Create", run: () => router.push("/portfolio") },
    { id: "paste-job", label: "Paste a job description", group: "Create", run: () => router.push("/jobs") },

    { id: "filter-top", label: "Filter: Top matches (≥70)", hint: "🔥", group: "Filter", run: () => router.push("/jobs?band=top") },
    { id: "filter-stretch", label: "Filter: Stretch (50-69)", hint: "💪", group: "Filter", run: () => router.push("/jobs?band=stretch") },
    { id: "filter-pass", label: "Filter: Pass (<50)", hint: "😴", group: "Filter", run: () => router.push("/jobs?band=pass") },
    { id: "filter-unscored", label: "Filter: Unscored", hint: "❓", group: "Filter", run: () => router.push("/jobs?band=unscored") },

    { id: "admin-runs", label: "Inspect scheduler runs", group: "Admin", run: () => window.open("/api/admin/runs", "_blank") },
    { id: "admin-budgets", label: "Inspect budgets", group: "Admin", run: () => window.open("/api/admin/budgets", "_blank") },
  ];

  const filtered = query.trim()
    ? actions.filter((a) => {
        const q = query.toLowerCase();
        return (
          a.label.toLowerCase().includes(q) ||
          a.group.toLowerCase().includes(q) ||
          (a.hint?.toLowerCase().includes(q) ?? false)
        );
      })
    : actions;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (!open) return;
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const a = filtered[activeIdx];
        if (a) {
          void a.run();
          setOpen(false);
          setQuery("");
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, activeIdx, filtered]);

  useEffect(() => {
    if (open) {
      setActiveIdx(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      setQuery("");
    }
  }, [open]);

  // Group filtered actions for display
  const groups = filtered.reduce<Record<string, CommandAction[]>>((acc, a) => {
    (acc[a.group] ||= []).push(a);
    return acc;
  }, {});

  const flatActions = filtered;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 inline-flex items-center gap-2 px-2.5 py-1.5 border border-[var(--border)] rounded-sm bg-[var(--bg-elev)] hover:border-[var(--border-hi)] text-[12px] text-[var(--fg-3)] transition-colors group"
        aria-label="Open command palette"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <span className="hidden sm:inline">Jump to…</span>
        <kbd className="hidden sm:inline ml-2 font-mono text-[10px] text-[var(--fg-4)] border border-[var(--border)] rounded px-1">
          ⌘K
        </kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] px-4 bg-[var(--bg)]/80 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-xl rounded-md border border-[var(--border-hi)] bg-[var(--bg-elev)] shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            style={{ animation: "editorial-rise 200ms cubic-bezier(0.16, 1, 0.3, 1) both" }}
          >
            <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-[var(--fg-3)]"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveIdx(0);
                }}
                placeholder="Search actions…"
                className="flex-1 bg-transparent border-0 outline-none text-[14px] text-[var(--fg)] placeholder:text-[var(--fg-4)]"
                style={{ boxShadow: "none" }}
              />
              <kbd className="font-mono text-[10px] text-[var(--fg-4)] border border-[var(--border)] rounded px-1.5 py-0.5">
                esc
              </kbd>
            </div>
            <div className="max-h-[60vh] overflow-y-auto py-1">
              {flatActions.length === 0 ? (
                <div className="px-4 py-6 text-center text-[var(--fg-3)] text-sm italic" style={{ fontFamily: "var(--font-serif)" }}>
                  no matches.
                </div>
              ) : (
                Object.entries(groups).map(([group, items]) => (
                  <div key={group} className="py-1">
                    <div
                      className="px-4 pt-2 pb-1 section-label uppercase tracking-wider"
                      style={{ fontSize: "10px" }}
                    >
                      {group}
                    </div>
                    {items.map((a) => {
                      const idx = flatActions.findIndex((x) => x.id === a.id);
                      const isActive = idx === activeIdx;
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onMouseEnter={() => setActiveIdx(idx)}
                          onClick={() => {
                            void a.run();
                            setOpen(false);
                            setQuery("");
                          }}
                          className={`w-full flex items-center gap-3 px-4 py-2 text-left text-[13px] transition-colors ${
                            isActive ? "bg-[var(--bg-elev-2)] text-[var(--fg)]" : "text-[var(--fg-2)]"
                          }`}
                        >
                          {isActive && (
                            <span
                              className="absolute left-0 w-[2px] h-5 bg-[var(--accent)]"
                              aria-hidden
                            />
                          )}
                          <span className="flex-1 truncate">{a.label}</span>
                          {a.hint && (
                            <span className="text-[var(--fg-4)] text-[11px]">{a.hint}</span>
                          )}
                          {a.shortcut && (
                            <kbd className="font-mono text-[10px] text-[var(--fg-4)]">
                              {a.shortcut}
                            </kbd>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
            <div className="border-t border-[var(--border)] px-4 py-2 flex items-center justify-between text-[10px] text-[var(--fg-4)] font-mono">
              <span>
                <kbd className="px-1 border border-[var(--border)] rounded mr-1">↑↓</kbd> navigate
                <span className="mx-2">·</span>
                <kbd className="px-1 border border-[var(--border)] rounded mr-1">↵</kbd> select
              </span>
              <span className="italic" style={{ fontFamily: "var(--font-serif)" }}>
                {flatActions.length} action{flatActions.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
