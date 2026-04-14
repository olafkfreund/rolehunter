"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Plus, Search, X } from "lucide-react";

type JobListItem = {
  id: number;
  title: string;
  company: string;
  location: string;
};

type ApplicationItem = {
  id: number;
  jobId: number;
};

export function AddApplicationButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [applications, setApplications] = useState<ApplicationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [creatingId, setCreatingId] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      fetch("/api/jobs").then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(`jobs ${r.status}`)),
      ),
      fetch("/api/applications").then((r) =>
        r.ok
          ? r.json()
          : Promise.reject(new Error(`applications ${r.status}`)),
      ),
    ])
      .then(([jobsJson, appsJson]) => {
        if (cancelled) return;
        const jobsArr: JobListItem[] = Array.isArray(jobsJson)
          ? jobsJson
          : Array.isArray(jobsJson?.items)
            ? jobsJson.items
            : Array.isArray(jobsJson?.jobs)
              ? jobsJson.jobs
              : [];
        const appsArr: ApplicationItem[] = Array.isArray(appsJson)
          ? appsJson
          : [];
        setJobs(jobsArr);
        setApplications(appsArr);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const trackedJobIds = useMemo(
    () => new Set(applications.map((a) => a.jobId)),
    [applications],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return jobs
      .filter((j) => !trackedJobIds.has(j.id))
      .filter((j) => {
        if (!q) return true;
        return (
          j.title.toLowerCase().includes(q) ||
          j.company.toLowerCase().includes(q) ||
          j.location.toLowerCase().includes(q)
        );
      })
      .slice(0, 100);
  }, [jobs, trackedJobIds, query]);

  async function handleTrack(jobId: number) {
    setCreatingId(jobId);
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      if (!res.ok) throw new Error(`POST ${res.status}`);
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setCreatingId(null);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md bg-[var(--primary)] px-3 py-2 text-sm font-medium text-[var(--primary-foreground)] transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Track application
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-[var(--border)] bg-[var(--background)] shadow-lg">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <Dialog.Title className="text-base font-semibold">
              Track a new application
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="rounded p-1 text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            Choose a job to start tracking in the Kanban board.
          </Dialog.Description>

          <div className="border-b border-[var(--border)] px-4 py-2">
            <div className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--muted)]/40 px-2 py-1.5">
              <Search className="h-4 w-4 text-[var(--muted-foreground)]" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search jobs by title, company, location…"
                className="w-full bg-transparent text-sm outline-none"
                autoFocus
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {loading ? (
              <div className="p-6 text-center text-sm text-[var(--muted-foreground)]">
                Loading…
              </div>
            ) : error ? (
              <div className="p-6 text-center text-sm text-[var(--danger)]">
                {error}
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center text-sm text-[var(--muted-foreground)]">
                {jobs.length === 0
                  ? "No jobs yet. Add jobs from the Jobs page."
                  : "No untracked jobs match."}
              </div>
            ) : (
              <ul className="flex flex-col gap-1">
                {filtered.map((job) => (
                  <li key={job.id}>
                    <button
                      type="button"
                      disabled={creatingId === job.id}
                      onClick={() => handleTrack(job.id)}
                      className="flex w-full items-start justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--muted)] disabled:opacity-50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{job.title}</div>
                        <div className="truncate text-xs text-[var(--muted-foreground)]">
                          {job.company}
                          {job.location ? ` · ${job.location}` : ""}
                        </div>
                      </div>
                      <span className="self-center text-xs text-[var(--accent)]">
                        {creatingId === job.id ? "Adding…" : "Track"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
