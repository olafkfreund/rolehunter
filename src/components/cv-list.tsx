"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Download, Trash2, Check } from "lucide-react";
import type { CvMaster } from "@/lib/db/schema";
import { CvEditorModal } from "./cv-editor-modal";

type CvRow = CvMaster & { experienceCount: number; skillsCount: number };

function relativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min${min === 1 ? "" : "s"} ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day} day${day === 1 ? "" : "s"} ago`;
  return d.toLocaleDateString();
}

async function parseJsonSafe(res: Response): Promise<{ error?: string } & Record<string, unknown>> {
  const text = await res.text();
  try {
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    return { error: text || `Request failed (${res.status})` };
  }
}

export function CvList({ initial }: { initial: CvRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<CvRow[]>(initial);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function onActivate(id: number) {
    if (busyId !== null) return;
    const prev = rows;
    // Optimistic update.
    setRows((rs) => rs.map((r) => ({ ...r, isActive: r.id === id })));
    setBusyId(id);
    setErr(null);
    try {
      const res = await fetch(`/api/cv/${id}/activate`, { method: "POST" });
      if (!res.ok) {
        const j = await parseJsonSafe(res);
        throw new Error(j.error?.toString?.() ?? `activate failed (${res.status})`);
      }
      startTransition(() => router.refresh());
    } catch (e) {
      setRows(prev);
      setErr(e instanceof Error ? e.message : "Activate failed");
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(cv: CvRow) {
    if (cv.isActive) return;
    if (!window.confirm(`Delete "${cv.title}"? This cannot be undone.`)) return;
    setBusyId(cv.id);
    setErr(null);
    try {
      const res = await fetch(`/api/cv/${cv.id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await parseJsonSafe(res);
        throw new Error(j.error?.toString?.() ?? `delete failed (${res.status})`);
      }
      setRows((rs) => rs.filter((r) => r.id !== cv.id));
      startTransition(() => router.refresh());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  async function onCleanup() {
    if (
      !window.confirm(
        `Delete ${rows.length - 1} inactive CV${rows.length - 1 === 1 ? "" : "s"}? This cannot be undone.`,
      )
    ) {
      return;
    }
    setCleanupBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/cv/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      if (!res.ok) {
        const j = await parseJsonSafe(res);
        throw new Error(j.error?.toString?.() ?? `cleanup failed (${res.status})`);
      }
      setRows((rs) => rs.filter((r) => r.isActive));
      startTransition(() => router.refresh());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Cleanup failed");
    } finally {
      setCleanupBusy(false);
    }
  }

  function handleSaved(updated: CvMaster) {
    setRows((rs) =>
      rs.map((r) => {
        if (r.id !== updated.id) return r;
        const pj = (updated.parsedJson ?? {}) as Record<string, unknown>;
        const experienceCount = Array.isArray(pj.experience) ? pj.experience.length : 0;
        const skillsCount = Array.isArray(pj.skills) ? pj.skills.length : 0;
        return { ...r, ...updated, experienceCount, skillsCount };
      }),
    );
    startTransition(() => router.refresh());
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--muted)]/20 p-6 text-center text-sm text-[var(--muted-foreground)]">
        No CVs yet. Upload one above.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.length >= 2 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--warning)]/10 px-4 py-3 text-sm">
          <div>
            You have {rows.length} CVs. Keep only the active one?
          </div>
          <button
            type="button"
            onClick={onCleanup}
            disabled={cleanupBusy}
            className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--muted)] disabled:opacity-50"
          >
            {cleanupBusy ? "Cleaning…" : "🧹 Delete all except active"}
          </button>
        </div>
      )}

      {err && <div className="text-sm text-[var(--danger)]">{err}</div>}

      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--muted)]/40 text-left text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
            <tr>
              <th className="w-10 px-3 py-2">Active</th>
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Uploaded</th>
              <th className="px-3 py-2">Roles / Skills</th>
              <th className="w-32 px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((cv) => (
              <tr
                key={cv.id}
                className="border-t border-[var(--border)] hover:bg-[var(--muted)]/20"
              >
                <td className="px-3 py-2">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={cv.isActive}
                    aria-label={cv.isActive ? "Active CV" : "Activate this CV"}
                    onClick={() => (cv.isActive ? null : onActivate(cv.id))}
                    disabled={busyId !== null}
                    className={`flex h-5 w-5 items-center justify-center rounded-full border transition-colors ${
                      cv.isActive
                        ? "border-[var(--success)] bg-[var(--success)] text-[var(--background)]"
                        : "border-[var(--border)] hover:border-[var(--accent)]"
                    } disabled:opacity-50`}
                  >
                    {cv.isActive && <Check className="h-3 w-3" />}
                  </button>
                </td>
                <td className="px-3 py-2 font-medium">{cv.title}</td>
                <td className="px-3 py-2 text-[var(--muted-foreground)]">
                  {relativeTime(cv.uploadedAt)}
                </td>
                <td className="px-3 py-2 text-[var(--muted-foreground)]">
                  {cv.experienceCount} role{cv.experienceCount === 1 ? "" : "s"} ·{" "}
                  {cv.skillsCount} skill{cv.skillsCount === 1 ? "" : "s"}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-1">
                    <CvEditorModal
                      cv={cv}
                      onSaved={handleSaved}
                      trigger={
                        <button
                          type="button"
                          aria-label={`Edit ${cv.title}`}
                          className="rounded p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      }
                    />
                    {cv.sourceFilePath ? (
                      <a
                        href={`/api/uploads/${cv.sourceFilePath}`}
                        download
                        aria-label={`Download ${cv.title}`}
                        className="rounded p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                      >
                        <Download className="h-4 w-4" />
                      </a>
                    ) : (
                      <button
                        type="button"
                        disabled
                        aria-label="No source file to download"
                        className="rounded p-1.5 text-[var(--muted-foreground)] opacity-40"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onDelete(cv)}
                      disabled={cv.isActive || busyId !== null}
                      aria-label={`Delete ${cv.title}`}
                      title={cv.isActive ? "Cannot delete the active CV" : "Delete"}
                      className="rounded p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--danger)]/10 hover:text-[var(--danger)] disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--muted-foreground)]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
