"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface PreviewJob {
  title: string;
  company: string;
  location: string;
  description: string;
  url: string;
  postedAt: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  employmentType: string | null;
  extractionMethod: "ats-api" | "json-ld" | "og-meta" | "heuristic";
}

export function JobUrlImport() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState<PreviewJob | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setUrl("");
    setPreview(null);
    setErr(null);
  }

  async function doPreview() {
    setErr(null);
    setPreview(null);
    if (!url.trim()) {
      setErr("Paste a URL");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/jobs/import-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url.trim(), preview: true }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          preview?: PreviewJob;
        };
        if (!res.ok) {
          setErr(data.error ?? `Preview failed (${res.status})`);
          return;
        }
        if (data.preview) setPreview(data.preview);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    });
  }

  async function save() {
    setErr(null);
    if (!url.trim()) return;
    startTransition(async () => {
      try {
        const res = await fetch("/api/jobs/import-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url.trim() }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          job?: { id: number };
        };
        if (!res.ok) {
          setErr(data.error ?? `Save failed (${res.status})`);
          return;
        }
        if (data.job?.id) {
          reset();
          setOpen(false);
          router.refresh();
          router.push(`/jobs/${data.job.id}`);
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-primary text-sm whitespace-nowrap"
        title="Paste a job URL — LinkedIn, Greenhouse, Lever, company careers page"
      >
        + Import from URL
      </button>
    );
  }

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="section-label">Import job from URL</div>
          <div className="text-[12px] text-[var(--fg-3)] mt-1">
            Paste a public job URL — Greenhouse, Lever, Ashby, Workable, SmartRecruiters,
            Workday, most company career pages. ATS hosts are pulled straight from their JSON
            API. LinkedIn requires the search adapter (bot-protected). Salary/posted-date/location
            extracted via JSON-LD when present.
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className="btn btn-ghost text-xs"
        >
          ✕
        </button>
      </div>

      <div className="flex gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://boards.greenhouse.io/acme/jobs/12345"
          className="input flex-1 font-mono text-sm"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && !preview) {
              e.preventDefault();
              doPreview();
            }
          }}
        />
        {!preview ? (
          <button
            type="button"
            onClick={doPreview}
            disabled={pending || !url.trim()}
            className="btn btn-primary text-sm whitespace-nowrap"
          >
            {pending ? "Fetching…" : "Preview"}
          </button>
        ) : (
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="btn btn-primary text-sm whitespace-nowrap"
          >
            {pending ? "Saving…" : "Save & open"}
          </button>
        )}
      </div>

      {err && (
        <div
          className="rounded-md border px-3 py-2 text-xs"
          style={{
            borderColor: "var(--danger)",
            background: "var(--danger)",
            color: "var(--bg)",
            opacity: 0.95,
          }}
        >
          {err}
        </div>
      )}

      {preview && (
        <div className="border border-[var(--border)] rounded-md p-4 bg-[var(--bg-elev)] space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="section-label">Preview</div>
            <div className="text-[10px] font-mono text-[var(--fg-3)]">
              via{" "}
              <span
                className="text-[var(--accent)]"
                title={
                  preview.extractionMethod === "ats-api"
                    ? "ATS JSON API (Greenhouse/Lever/Ashby/Workable/SmartRecruiters) — most reliable"
                    : preview.extractionMethod === "json-ld"
                      ? "schema.org JobPosting — most reliable"
                      : preview.extractionMethod === "og-meta"
                        ? "Open Graph tags — partial extraction"
                        : "heuristic body scan — least reliable"
                }
              >
                {preview.extractionMethod}
              </span>
            </div>
          </div>

          <div>
            <div className="text-[18px] font-medium tracking-tight">{preview.title}</div>
            <div className="mt-0.5 text-[13px] text-[var(--fg-2)]">
              {preview.company || (
                <span
                  className="italic text-[var(--fg-3)]"
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  unknown company
                </span>
              )}
              {preview.location && (
                <>
                  <span className="text-[var(--fg-4)] mx-1.5">/</span>
                  <span className="text-[var(--fg-3)]">{preview.location}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--fg-3)]">
            {preview.postedAt && (
              <span>
                posted{" "}
                <span className="mono">
                  {new Date(preview.postedAt).toLocaleDateString()}
                </span>
              </span>
            )}
            {preview.employmentType && <span>{preview.employmentType}</span>}
            {(preview.salaryMin || preview.salaryMax) && (
              <span className="mono">
                {preview.salaryCurrency ?? ""}{" "}
                {preview.salaryMin?.toLocaleString() ?? "?"}–
                {preview.salaryMax?.toLocaleString() ?? "?"}
              </span>
            )}
          </div>

          <div className="text-[12px] text-[var(--fg-2)] line-clamp-6 whitespace-pre-wrap">
            {preview.description.slice(0, 1_500)}
          </div>

          <div className="text-[10px] text-[var(--fg-4)] font-mono">
            {preview.description.length.toLocaleString()} chars extracted ·{" "}
            <a
              href={preview.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--accent)] hover:underline"
            >
              open source ↗
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
