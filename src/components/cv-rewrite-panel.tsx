"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { CvMaster, CvVariant } from "@/lib/db/schema";
import type { Provider } from "@/lib/llm/types";
import { ProviderToggle } from "./provider-toggle";
import { CvDiffViewer } from "./cv-diff-viewer";
import { VariantEditor } from "./variant-editor";

type VariantResponse = CvVariant | null;
type Theme = "modern" | "classic";

function isTheme(v: unknown): v is Theme {
  return v === "modern" || v === "classic";
}

function ThemeToggle({
  value,
  onChange,
  disabled,
}: {
  value: Theme;
  onChange: (t: Theme) => void;
  disabled?: boolean;
}) {
  const base =
    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50";
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-[var(--muted-foreground)]">Theme</span>
      <div className="inline-flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 p-1">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange("modern")}
          className={`${base} ${value === "modern" ? "bg-[var(--foreground)] text-[var(--background)]" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}
        >
          Modern
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange("classic")}
          className={`${base} ${value === "classic" ? "bg-[var(--foreground)] text-[var(--background)]" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}
        >
          Classic
        </button>
      </div>
    </div>
  );
}

export function CvRewritePanel({ jobId }: { jobId: number }) {
  const [provider, setProvider] = useState<Provider>("claude");
  const [variant, setVariant] = useState<VariantResponse>(null);
  const [master, setMaster] = useState<CvMaster | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>("modern");
  const [themeBusy, setThemeBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [vRes, cRes] = await Promise.all([
          fetch(`/api/cv/rewrite?jobId=${jobId}`, { cache: "no-store" }),
          fetch("/api/cv", { cache: "no-store" }),
        ]);
        const [vJson, cJson] = await Promise.all([vRes.json(), cRes.json()]);
        if (cancelled) return;
        if (vRes.ok) setVariant(vJson as VariantResponse);
        if (cRes.ok) setMaster(cJson as CvMaster | null);
        if (vJson && typeof vJson === "object" && "provider" in vJson) {
          setProvider((vJson as CvVariant).provider);
        }
        if (
          vJson &&
          typeof vJson === "object" &&
          "theme" in vJson &&
          isTheme((vJson as { theme: unknown }).theme)
        ) {
          setTheme((vJson as { theme: Theme }).theme);
        }
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  async function onRewrite() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/cv/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, provider }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(
          typeof json?.error === "string"
            ? json.error
            : "Rewrite failed",
        );
      }
      const row = json as CvVariant;
      setVariant(row);
      if (isTheme(row.theme)) setTheme(row.theme);
      setShowDiff(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Rewrite failed");
    } finally {
      setBusy(false);
    }
  }

  async function onChangeTheme(next: Theme) {
    if (!variant || next === theme || themeBusy) return;
    const prev = theme;
    setTheme(next);
    setThemeBusy(true);
    try {
      const res = await fetch(`/api/variants/${variant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: next }),
      });
      const text = await res.text();
      let body: unknown = null;
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          body = text;
        }
      }
      if (!res.ok) {
        const msg =
          body && typeof body === "object" && "error" in body
            ? String((body as { error: unknown }).error)
            : "Failed to update theme";
        throw new Error(msg);
      }
      if (body && typeof body === "object") {
        setVariant(body as CvVariant);
        const t = (body as { theme?: unknown }).theme;
        if (isTheme(t)) setTheme(t);
      }
      toast.success("Saved");
    } catch (e) {
      setTheme(prev);
      toast.error(e instanceof Error ? e.message : "Failed to update theme");
    } finally {
      setThemeBusy(false);
    }
  }

  async function onExport() {
    if (!variant) return;
    setExporting(true);
    setErr(null);
    try {
      const res = await fetch("/api/cv/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantId: variant.id }),
      });
      if (!res.ok) {
        const maybe = await res.json().catch(() => null);
        throw new Error(
          typeof maybe?.error === "string" ? maybe.error : "Export failed",
        );
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rolehunter-cv-${variant.id}.pdf`;
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

  return (
    <section className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--background)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Tailored CV</h2>
          <p className="text-xs text-[var(--muted-foreground)]">
            Rewrite your master CV for this role and export an ATS-safe PDF.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ProviderToggle
            value={provider}
            onChange={setProvider}
            disabled={busy || exporting}
          />
          <button
            type="button"
            onClick={onRewrite}
            disabled={busy || loading}
            className="rounded-md bg-[var(--foreground)] px-4 py-1.5 text-sm font-medium text-[var(--background)] disabled:opacity-50"
          >
            {busy
              ? "Rewriting…"
              : variant
                ? "Rewrite again"
                : "Rewrite CV for this role"}
          </button>
        </div>
      </div>

      {err && <div className="text-sm text-[var(--danger)]">{err}</div>}

      {loading && (
        <div className="text-sm text-[var(--muted-foreground)]">Loading…</div>
      )}

      {!loading && !variant && !err && (
        <div className="rounded-md border border-dashed border-[var(--border)] bg-[var(--muted)]/30 p-4 text-sm text-[var(--muted-foreground)]">
          No tailored CV yet. Choose a provider and click “Rewrite CV for this
          role”.
        </div>
      )}

      {variant && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-[var(--muted-foreground)]">
              Generated with{" "}
              <span className="font-medium text-[var(--foreground)]">
                {variant.provider}
              </span>{" "}
              · {new Date(variant.createdAt).toLocaleString()}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ThemeToggle
                value={theme}
                onChange={onChangeTheme}
                disabled={themeBusy || exporting || editing || busy}
              />
              <button
                type="button"
                onClick={() => setShowDiff((v) => !v)}
                disabled={editing}
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--muted)] disabled:opacity-50"
              >
                {showDiff ? "Hide diff" : "Show diff"}
              </button>
              <button
                type="button"
                onClick={() => setEditing((v) => !v)}
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--muted)]"
              >
                {editing ? "Close editor" : "Edit"}
              </button>
              <button
                type="button"
                onClick={onExport}
                disabled={exporting || editing}
                className="rounded-md bg-[var(--foreground)] px-4 py-1.5 text-sm font-medium text-[var(--background)] disabled:opacity-50"
              >
                {exporting ? "Rendering PDF…" : "Download PDF"}
              </button>
            </div>
          </div>

          {Array.isArray(variant.keywords) && variant.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {(variant.keywords as unknown as string[]).map((k, i) => (
                <span
                  key={`${k}-${i}`}
                  className="rounded-full border border-[var(--border)] bg-[var(--muted)]/50 px-2.5 py-0.5 text-xs text-[var(--foreground)]"
                >
                  {k}
                </span>
              ))}
            </div>
          )}

          {editing ? (
            <VariantEditor
              initialMarkdown={variant.tailoredMarkdown}
              initialKeywords={
                Array.isArray(variant.keywords)
                  ? (variant.keywords as unknown as string[])
                  : []
              }
              variantId={variant.id}
              onSaved={(row) => {
                setVariant({
                  ...variant,
                  tailoredMarkdown: row.tailoredMarkdown,
                  keywords: row.keywords as unknown as CvVariant["keywords"],
                });
                setEditing(false);
                toast.success("Tailored CV updated");
              }}
              onCancel={() => setEditing(false)}
            />
          ) : (
            showDiff && (
              <CvDiffViewer
                original={master?.rawMarkdown ?? ""}
                tailored={variant.tailoredMarkdown}
              />
            )
          )}
        </div>
      )}
    </section>
  );
}
