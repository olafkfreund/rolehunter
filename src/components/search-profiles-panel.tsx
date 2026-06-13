"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles, Check, Loader2 } from "lucide-react";
import type { SearchProfile, SearchRun } from "@/lib/db/schema";
import type { SuggestedRole } from "@/lib/llm/types";


type Frequency = "hourly" | "every_4h" | "daily" | "weekly";
type RemoteMode = "remote" | "hybrid" | "onsite";
type SourceId =
  | "jsearch"
  | "linkedin"
  | "adzuna"
  | "indeed"
  | "dice"
  | "jobspy"
  | "apify"
  | "paste"
  | "greenhouse"
  | "lever"
  | "workday"
  | "glassdoor"
  | "reed"
  | "workable"
  | "ashby"
  | "smartrecruiters";

const SOURCES: { id: SourceId; label: string; needsCompanies?: boolean }[] = [
  { id: "jsearch", label: "JSearch" },
  { id: "linkedin", label: "LinkedIn (RapidAPI)" },
  { id: "jobspy", label: "JobSpy (LI+Indeed scrape)" },
  { id: "adzuna", label: "Adzuna" },
  { id: "indeed", label: "Indeed (MCP)" },
  { id: "dice", label: "Dice (MCP)" },
  { id: "apify", label: "Apify on-demand (paid)" },
  { id: "glassdoor", label: "Glassdoor (via Apify)" },
  { id: "reed", label: "Reed.co.uk" },
  { id: "greenhouse", label: "Greenhouse (ATS)", needsCompanies: true },
  { id: "lever", label: "Lever (ATS)", needsCompanies: true },
  { id: "workday", label: "Workday (ATS)", needsCompanies: true },
  { id: "workable", label: "Workable (ATS)", needsCompanies: true },
  { id: "ashby", label: "Ashby (ATS)", needsCompanies: true },
  { id: "smartrecruiters", label: "SmartRecruiters (ATS)", needsCompanies: true },
];

const ATS_SOURCES: SourceId[] = [
  "greenhouse",
  "lever",
  "workday",
  "workable",
  "ashby",
  "smartrecruiters",
];

const FREQUENCIES: { id: Frequency; label: string }[] = [
  { id: "hourly", label: "Hourly" },
  { id: "every_4h", label: "Every 4h" },
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
];

const REMOTE_MODES: { id: RemoteMode; label: string }[] = [
  { id: "remote", label: "Remote" },
  { id: "hybrid", label: "Hybrid" },
  { id: "onsite", label: "Onsite" },
];

interface FormState {
  name: string;
  query: string;
  location: string;
  salaryMin: string;
  salaryCurrency: string;
  sources: SourceId[];
  companies: string;
  frequency: Frequency;
  remoteModes: RemoteMode[];
}

const CURRENCIES = [
  "GBP",
  "USD",
  "EUR",
  "CAD",
  "AUD",
  "CHF",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
  "JPY",
  "INR",
  "SGD",
  "NZD",
  "ZAR",
  "BRL",
  "MXN",
];

const EMPTY_FORM: FormState = {
  name: "",
  query: "",
  location: "",
  salaryMin: "",
  salaryCurrency: "GBP",
  sources: ["jsearch"],
  companies: "",
  frequency: "daily",
  remoteModes: ["remote", "hybrid"],
};

function timeAgo(iso: string | Date | null): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "never";
  const diff = Date.now() - then;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function fmtNextRun(iso: Date | null | undefined): string {
  if (!iso) return "—";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "due now";
  if (ms < 3_600_000) return `in ${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) return `in ${Math.floor(ms / 3_600_000)}h`;
  return `in ${Math.floor(ms / 86_400_000)}d`;
}

export function SearchProfilesPanel({
  initialProfiles,
}: {
  initialProfiles: SearchProfile[];
}) {
  const router = useRouter();
  const [profiles, setProfiles] = useState<SearchProfile[]>(initialProfiles);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const [expandedRuns, setExpandedRuns] = useState<number | null>(null);
  const [runs, setRuns] = useState<Record<number, SearchRun[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestedRole[] | null>(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadSuggestions() {
      setLoadingSuggestions(true);
      try {
        const res = await fetch("/api/cv/suggest-roles");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        if (data && Array.isArray(data.suggestions)) {
          setSuggestions(data.suggestions);
        }
      } catch {
        // fail silently
      } finally {
        if (!cancelled) setLoadingSuggestions(false);
      }
    }
    loadSuggestions();
    return () => {
      cancelled = true;
    };
  }, []);

  async function approveSuggestion(sug: SuggestedRole) {
    setBusy(true);
    setError(null);
    try {
      const body = {
        name: sug.name,
        query: sug.query,
        sources: ["jsearch", "linkedin"],
        frequency: "daily",
        remoteModes: ["remote", "hybrid"],
        active: true,
      };
      const res = await fetch("/api/search-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Failed (${res.status})`);
      }
      setSuggestions((prev) => prev ? prev.filter((item) => item.query !== sug.query) : null);
      await refresh();
      toast.success(`Search profile "${sug.name}" approved and added!`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to approve suggestion");
    } finally {
      setBusy(false);
    }
  }


  function toggleSource(id: SourceId) {
    setForm((f) => ({
      ...f,
      sources: f.sources.includes(id)
        ? f.sources.filter((s) => s !== id)
        : [...f.sources, id],
    }));
  }

  function toggleRemoteMode(id: RemoteMode) {
    setForm((f) => ({
      ...f,
      remoteModes: f.remoteModes.includes(id)
        ? f.remoteModes.filter((r) => r !== id)
        : [...f.remoteModes, id],
    }));
  }

  async function refresh() {
    const res = await fetch("/api/search-profiles");
    if (res.ok) {
      const json = (await res.json()) as { profiles: SearchProfile[] };
      setProfiles(json.profiles);
    }
  }

  async function createNew(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim() || !form.query.trim()) {
      setError("Name and query are required.");
      return;
    }
    if (form.sources.length === 0) {
      setError("Select at least one source.");
      return;
    }
    const usesAts = form.sources.some((s) => ATS_SOURCES.includes(s));
    const companiesList = form.companies
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (usesAts && companiesList.length === 0) {
      setError("ATS sources (Greenhouse / Lever / Workday / Workable / Ashby / SmartRecruiters) require at least one company in the Companies field.");
      return;
    }
    setBusy(true);
    try {
      const body = {
        name: form.name.trim(),
        query: form.query.trim(),
        location: form.location.trim() || undefined,
        salaryMinUsd: form.salaryMin ? Number(form.salaryMin) : undefined,
        salaryCurrency: form.salaryCurrency,
        sources: form.sources,
        companies: companiesList,
        frequency: form.frequency,
        remoteModes: form.remoteModes,
      };
      const res = await fetch("/api/search-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setError(err.error ?? `Failed (${res.status})`);
        return;
      }
      setForm(EMPTY_FORM);
      setShowForm(false);
      await refresh();
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  async function runNow(id: number) {
    setBusy(true);
    try {
      await fetch(`/api/search-profiles/${id}/run-now`, { method: "POST" });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function togglePause(p: SearchProfile) {
    setBusy(true);
    try {
      await fetch(`/api/search-profiles/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !p.active }),
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function deleteProfile(id: number) {
    if (!confirm("Delete this saved search? Run history will be deleted too.")) return;
    setBusy(true);
    try {
      await fetch(`/api/search-profiles/${id}`, { method: "DELETE" });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function loadRuns(id: number) {
    if (expandedRuns === id) {
      setExpandedRuns(null);
      return;
    }
    setExpandedRuns(id);
    const res = await fetch(`/api/search-profiles/${id}/runs?limit=10`);
    if (res.ok) {
      const json = (await res.json()) as { runs: SearchRun[] };
      setRuns((r) => ({ ...r, [id]: json.runs }));
    }
  }

  return (
    <div className="space-y-4">
      {/* AI Recommended Searches */}
      {loadingSuggestions && (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--muted)]/10 p-4 text-sm text-[var(--muted-foreground)]">
          <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" />
          <span>Analyzing your active CV to suggest search profiles...</span>
        </div>
      )}

      {!loadingSuggestions && suggestions && suggestions.length > 0 && (
        <div className="border border-[var(--accent)]/30 rounded-lg bg-[var(--accent)]/5 p-4 space-y-3 relative overflow-hidden transition-all hover:border-[var(--accent)]/50">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[var(--accent)] animate-pulse" />
            <h3 className="text-sm font-semibold text-[var(--foreground)]">AI Recommended Search Profiles</h3>
          </div>
          <p className="text-xs text-[var(--muted-foreground)]">
            Based on your uploaded CV, these roles are the best match for your experience. Approve them to add them to your automated saved searches.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {suggestions.map((sug, idx) => (
              <div
                key={`sug-${idx}`}
                className="border border-[var(--border)] rounded-md bg-[var(--background)] p-3 flex flex-col justify-between hover:shadow-md transition-all"
              >
                <div className="space-y-1.5">
                  <div className="text-xs font-bold text-[var(--foreground)]">{sug.name}</div>
                  <div className="text-[10px] font-mono text-[var(--muted-foreground)] bg-[var(--muted)]/50 px-1.5 py-0.5 rounded inline-block">
                    query: "{sug.query}"
                  </div>
                  <p className="text-[11px] text-[var(--muted-foreground)] leading-relaxed">{sug.reason}</p>
                </div>
                <div className="mt-3">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => approveSuggestion(sug)}
                    className="w-full flex items-center justify-center gap-1 rounded bg-[var(--foreground)] px-2.5 py-1 text-xs font-semibold text-[var(--background)] hover:opacity-90 disabled:opacity-50 transition-all cursor-pointer"
                  >
                    <Check className="h-3 w-3" />
                    Approve &amp; Search
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="text-sm text-[var(--muted-foreground)]">
          {profiles.length} {profiles.length === 1 ? "profile" : "profiles"}
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--muted)]"
        >
          {showForm ? "Cancel" : "+ New search"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={createNew}
          className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--muted)]/30 p-4"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-medium text-[var(--muted-foreground)]">Name *</span>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. UK Senior SRE"
                className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
                required
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-[var(--muted-foreground)]">Query *</span>
              <input
                type="text"
                value={form.query}
                onChange={(e) => setForm({ ...form, query: e.target.value })}
                placeholder="e.g. senior site reliability engineer"
                className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
                required
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-[var(--muted-foreground)]">Location</span>
              <input
                type="text"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="e.g. London"
                className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-[var(--muted-foreground)]">Min salary</span>
              <div className="flex gap-2">
                <select
                  value={form.salaryCurrency}
                  onChange={(e) => setForm({ ...form, salaryCurrency: e.target.value })}
                  className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
                  aria-label="Salary currency"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  value={form.salaryMin}
                  onChange={(e) => setForm({ ...form, salaryMin: e.target.value })}
                  placeholder="0"
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
                />
              </div>
            </label>
          </div>

          <div className="space-y-1">
            <span className="text-xs font-medium text-[var(--muted-foreground)]">
              Sources * (at least one)
            </span>
            <div className="flex flex-wrap gap-2">
              {SOURCES.map((s) => {
                const on = form.sources.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleSource(s.id)}
                    className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                      on
                        ? "border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]"
                        : "border-[var(--border)] bg-[var(--background)] hover:bg-[var(--muted)]"
                    } ${s.needsCompanies ? "italic" : ""}`}
                    title={s.needsCompanies ? "Requires Companies field below" : undefined}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          {form.sources.some((s) => ATS_SOURCES.includes(s)) && (
            <div className="space-y-1">
              <span className="text-xs font-medium text-[var(--muted-foreground)]">
                Companies * (required for ATS sources — comma or newline separated)
              </span>
              <textarea
                value={form.companies}
                onChange={(e) => setForm({ ...form, companies: e.target.value })}
                placeholder="stripe, datadog, anthropic&#10;# Workday: use tenant/site format&#10;nvidia/External"
                rows={3}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm font-mono"
              />
              <div className="text-[10px] text-[var(--muted-foreground)]">
                Greenhouse / Lever / Workable / Ashby / SmartRecruiters: company slug
                (e.g. <code>stripe</code>). Workday: <code>tenant/site</code> (e.g.{" "}
                <code>nvidia/External</code>).
              </div>
            </div>
          )}

          <div className="space-y-1">
            <span className="text-xs font-medium text-[var(--muted-foreground)]">Remote modes</span>
            <div className="flex flex-wrap gap-2">
              {REMOTE_MODES.map((r) => {
                const on = form.remoteModes.includes(r.id);
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => toggleRemoteMode(r.id)}
                    className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                      on
                        ? "border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]"
                        : "border-[var(--border)] bg-[var(--background)] hover:bg-[var(--muted)]"
                    }`}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-xs font-medium text-[var(--muted-foreground)]">Frequency</span>
            <div className="flex flex-wrap gap-2">
              {FREQUENCIES.map((f) => (
                <label
                  key={f.id}
                  className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs transition-colors ${
                    form.frequency === f.id
                      ? "border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]"
                      : "border-[var(--border)] bg-[var(--background)] hover:bg-[var(--muted)]"
                  }`}
                >
                  <input
                    type="radio"
                    name="freq"
                    value={f.id}
                    checked={form.frequency === f.id}
                    onChange={() => setForm({ ...form, frequency: f.id })}
                    className="hidden"
                  />
                  {f.label}
                </label>
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setForm(EMPTY_FORM);
              }}
              className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm hover:bg-[var(--muted)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-[var(--foreground)] px-3 py-1.5 text-sm font-medium text-[var(--background)] hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Create"}
            </button>
          </div>
        </form>
      )}

      {profiles.length === 0 && !showForm ? (
        <div className="rounded-lg border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted-foreground)]">
          No saved searches yet. Create one to start the firehose flowing in.
        </div>
      ) : (
        <ul className="space-y-2">
          {profiles.map((p) => {
            const sources = Array.isArray(p.sources) ? (p.sources as string[]) : [];
            const isOpen = expandedRuns === p.id;
            const profileRuns = runs[p.id] ?? [];
            return (
              <li
                key={p.id}
                className="rounded-lg border border-[var(--border)] bg-[var(--background)]"
              >
                <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-block size-2 rounded-full ${
                          p.active ? "bg-emerald-500" : "bg-gray-400"
                        }`}
                        title={p.active ? "Active" : "Paused"}
                      />
                      <span className="font-semibold">{p.name}</span>
                      <span className="text-xs text-[var(--muted-foreground)]">
                        · {p.frequency}
                      </span>
                    </div>
                    <div className="mt-1 truncate text-sm text-[var(--muted-foreground)]">
                      <span className="font-mono">&ldquo;{p.query}&rdquo;</span>
                      {p.location ? ` · ${p.location}` : ""}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {sources.map((s) => (
                        <span
                          key={s}
                          className="rounded-full border border-[var(--border)] bg-[var(--muted)]/50 px-2 py-0.5 text-[10px] uppercase tracking-wide"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--muted-foreground)]">
                      <span>last run {timeAgo(p.lastRunAt)}</span>
                      <span>next {fmtNextRun(p.nextRunAt)}</span>
                      {p.salaryMinUsd ? (
                        <span>
                          min {p.salaryCurrency ?? "USD"} {p.salaryMinUsd.toLocaleString()}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => runNow(p.id)}
                      disabled={busy}
                      className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs hover:bg-[var(--muted)] disabled:opacity-50"
                    >
                      Run now
                    </button>
                    <button
                      type="button"
                      onClick={() => togglePause(p)}
                      disabled={busy}
                      className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs hover:bg-[var(--muted)] disabled:opacity-50"
                    >
                      {p.active ? "Pause" : "Resume"}
                    </button>
                    <button
                      type="button"
                      onClick={() => loadRuns(p.id)}
                      className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs hover:bg-[var(--muted)]"
                    >
                      {isOpen ? "Hide history" : "History"}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteProfile(p.id)}
                      disabled={busy}
                      className="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs text-red-300 hover:bg-red-500/20 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t border-[var(--border)] bg-[var(--muted)]/20 px-4 py-3">
                    <div className="mb-2 text-xs font-medium text-[var(--muted-foreground)]">
                      Last {profileRuns.length} runs
                    </div>
                    {profileRuns.length === 0 ? (
                      <div className="text-xs text-[var(--muted-foreground)]">
                        No runs yet. Click <span className="font-medium">Run now</span> to trigger one — it&apos;ll fire on the next 60s tick.
                      </div>
                    ) : (
                      <ul className="space-y-1 text-xs">
                        {profileRuns.map((r) => (
                          <li
                            key={r.id}
                            className="flex flex-wrap items-center gap-2 rounded-md bg-[var(--background)] px-2 py-1.5"
                          >
                            <span
                              className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase ${
                                r.status === "success"
                                  ? "bg-emerald-500/20 text-emerald-400"
                                  : r.status === "failed"
                                  ? "bg-red-500/20 text-red-300"
                                  : r.status === "partial"
                                  ? "bg-amber-500/20 text-amber-300"
                                  : r.status === "skipped_budget"
                                  ? "bg-purple-500/20 text-purple-300"
                                  : "bg-blue-500/20 text-blue-300"
                              }`}
                            >
                              {r.status}
                            </span>
                            <span className="font-medium">{r.source}</span>
                            <span className="text-[var(--muted-foreground)]">
                              {timeAgo(r.startedAt)}
                            </span>
                            <span>{r.jobsFound} found</span>
                            <span className="text-emerald-400">{r.jobsNew} new</span>
                            {r.jobsDuplicate > 0 && (
                              <span className="text-[var(--muted-foreground)]">
                                {r.jobsDuplicate} dup
                              </span>
                            )}
                            {r.durationMs && (
                              <span className="text-[var(--muted-foreground)]">
                                {(r.durationMs / 1000).toFixed(1)}s
                              </span>
                            )}
                            {r.errorMessage && (
                              <span className="ml-auto max-w-[60ch] truncate text-red-300/80">
                                {r.errorMessage}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
