"use client";

import Link from "next/link";
import { useState } from "react";
import { Download, ExternalLink } from "lucide-react";
import { ScoreGauge } from "@/components/score-gauge";

type LatestVariant = {
  variantId: number;
  createdAt: string;
  jobId: number;
  jobTitle: string;
  company: string;
  pdfPath: string | null;
  score: number | null;
  provider: "claude" | "gemini";
} | null;

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / (1000 * 60));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
}

export function LatestVariantCard({ variant }: { variant: LatestVariant }) {
  const [exporting, setExporting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (variant === null) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted-foreground)]">
        No tailored CV yet.{" "}
        <Link
          href="/jobs"
          className="text-[var(--foreground)] underline underline-offset-2"
        >
          Tailor your first CV
        </Link>
        .
      </div>
    );
  }

  async function onDownload() {
    if (!variant) return;
    setExporting(true);
    setErr(null);
    try {
      const res = await fetch("/api/cv/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantId: variant.variantId }),
      });
      if (!res.ok) {
        const text = await res.text();
        let msg = `Export failed (${res.status})`;
        if (text) {
          try {
            const json = JSON.parse(text);
            if (typeof json?.error === "string") msg = json.error;
          } catch {
            // swallow — keep default msg
          }
        }
        throw new Error(msg);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rolehunter-cv-${variant.variantId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  const providerLabel = variant.provider === "claude" ? "Claude" : "Gemini";

  return (
    <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--background)] p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div
                className="truncate text-sm font-medium"
                title={`${variant.jobTitle} — ${variant.company}`}
              >
                {variant.jobTitle}{" "}
                <span className="text-[var(--muted-foreground)]">
                  — {variant.company}
                </span>
              </div>
              <Link
                href="/profile"
                className="shrink-0 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:underline"
              >
                Edit master CV
              </Link>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--muted-foreground)]">
              <span>{timeAgo(variant.createdAt)}</span>
              <span aria-hidden>·</span>
              <span>{providerLabel}</span>
              {variant.score !== null ? (
                <>
                  <span aria-hidden>·</span>
                  <ScoreGauge
                    score={variant.score}
                    size={28}
                    strokeWidth={4}
                    showLabel={false}
                  />
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onDownload}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--foreground)] px-3 py-1.5 text-sm font-medium text-[var(--background)] disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            {exporting ? "Exporting…" : "Download PDF"}
          </button>
          <Link
            href={`/jobs/${variant.jobId}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--muted)]"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open job
          </Link>
        </div>

      {err ? <div className="text-xs text-[var(--danger)]">{err}</div> : null}
    </div>
  );
}
