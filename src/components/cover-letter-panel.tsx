"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import type { CoverLetter, CoverLetterTemplate } from "@/lib/db/schema";
import type { Provider } from "@/lib/llm/types";
import { ProviderToggle } from "./provider-toggle";

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

type ApplicationItem = {
  id: number;
  jobId: number;
};

async function parseJsonSafe(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "error" in body) {
    const e = (body as { error: unknown }).error;
    if (typeof e === "string") return e;
    if (e && typeof e === "object") {
      try {
        return JSON.stringify(e);
      } catch {
        return fallback;
      }
    }
  }
  return fallback;
}

export function CoverLetterPanel({ jobId }: { jobId: number }) {
  const [provider, setProvider] = useState<Provider>("claude");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [applicationId, setApplicationId] = useState<number | null>(null);
  const [templates, setTemplates] = useState<CoverLetterTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(
    null,
  );
  const [letter, setLetter] = useState<CoverLetter | null>(null);
  const [theme, setTheme] = useState<Theme>("modern");
  const [themeBusy, setThemeBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const appsRes = await fetch("/api/applications", { cache: "no-store" });
        const appsBody = (await parseJsonSafe(appsRes)) as ApplicationItem[] | null;
        if (!appsRes.ok) {
          throw new Error(errorMessage(appsBody, "Failed to load applications"));
        }
        const apps: ApplicationItem[] = Array.isArray(appsBody) ? appsBody : [];
        const app = apps.find((a) => a.jobId === jobId) ?? null;
        if (cancelled) return;
        if (!app) {
          setApplicationId(null);
          setLoading(false);
          return;
        }
        setApplicationId(app.id);

        const [tRes, lRes] = await Promise.all([
          fetch("/api/cover-letter-templates", { cache: "no-store" }),
          fetch(`/api/cover-letters?appId=${app.id}`, { cache: "no-store" }),
        ]);
        const [tBody, lBody] = await Promise.all([
          parseJsonSafe(tRes),
          parseJsonSafe(lRes),
        ]);
        if (cancelled) return;
        if (tRes.ok && Array.isArray(tBody)) {
          setTemplates(tBody as CoverLetterTemplate[]);
        }
        if (lRes.ok && Array.isArray(lBody)) {
          const letters = lBody as CoverLetter[];
          if (letters[0]) {
            setLetter(letters[0]);
            if (letters[0].provider) setProvider(letters[0].provider);
            if (letters[0].templateId != null) {
              setSelectedTemplateId(letters[0].templateId);
            }
            if (isTheme(letters[0].theme)) setTheme(letters[0].theme);
          }
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

  async function onGenerate() {
    if (applicationId === null) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/cover-letters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId,
          templateId: selectedTemplateId,
          provider,
        }),
      });
      const body = await parseJsonSafe(res);
      if (!res.ok) throw new Error(errorMessage(body, "Generation failed"));
      const row = body as CoverLetter;
      setLetter(row);
      if (isTheme(row.theme)) setTheme(row.theme);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setBusy(false);
    }
  }

  async function onExport() {
    if (!letter) return;
    setExporting(true);
    setErr(null);
    try {
      const res = await fetch(`/api/cover-letters/${letter.id}/export-pdf`, {
        method: "POST",
      });
      if (!res.ok) {
        const maybe = await parseJsonSafe(res);
        throw new Error(errorMessage(maybe, "Export failed"));
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rolehunter-cover-letter-${letter.id}.pdf`;
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

  async function onChangeTheme(next: Theme) {
    if (!letter || next === theme || themeBusy) return;
    const prev = theme;
    setTheme(next);
    setThemeBusy(true);
    try {
      const res = await fetch(`/api/cover-letters/${letter.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: next }),
      });
      const body = await parseJsonSafe(res);
      if (!res.ok) {
        throw new Error(errorMessage(body, "Failed to update theme"));
      }
      if (body && typeof body === "object") {
        setLetter(body as CoverLetter);
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

  if (loading) {
    return (
      <section className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--background)] p-5">
        <h2 className="text-base font-semibold">Cover letter</h2>
        <div className="text-sm text-[var(--muted-foreground)]">Loading…</div>
      </section>
    );
  }

  if (applicationId === null) {
    return (
      <section className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--background)] p-5">
        <h2 className="text-base font-semibold">Cover letter</h2>
        <div className="rounded-md border border-dashed border-[var(--border)] bg-[var(--muted)]/30 p-4 text-sm text-[var(--muted-foreground)]">
          Track this job first to generate a cover letter.{" "}
          <Link
            href="/kanban"
            className="font-medium text-[var(--foreground)] underline"
          >
            Open tracker
          </Link>
        </div>
      </section>
    );
  }

  const keywords: string[] = []; // reserved: the API currently persists only generatedMd, not keywords

  return (
    <section className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--background)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Cover letter</h2>
          <p className="text-xs text-[var(--muted-foreground)]">
            Generate a tailored letter for this role and export as PDF.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedTemplateId ?? ""}
            onChange={(e) =>
              setSelectedTemplateId(
                e.target.value === "" ? null : Number(e.target.value),
              )
            }
            disabled={busy || exporting}
            className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm disabled:opacity-50"
          >
            <option value="">(use default)</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.isDefault ? " — default" : ""}
              </option>
            ))}
          </select>
          <ProviderToggle
            value={provider}
            onChange={setProvider}
            disabled={busy || exporting}
          />
          <button
            type="button"
            onClick={onGenerate}
            disabled={busy}
            className="rounded-md bg-[var(--foreground)] px-4 py-1.5 text-sm font-medium text-[var(--background)] disabled:opacity-50"
          >
            {busy
              ? "Generating…"
              : letter
                ? "Regenerate"
                : "Generate cover letter"}
          </button>
        </div>
      </div>

      {err && <div className="text-sm text-[var(--danger)]">{err}</div>}

      {!letter && !err && (
        <div className="rounded-md border border-dashed border-[var(--border)] bg-[var(--muted)]/30 p-4 text-sm text-[var(--muted-foreground)]">
          No cover letter yet. Pick a template (optional), choose a provider,
          then click “Generate cover letter”.
        </div>
      )}

      {letter && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-[var(--muted-foreground)]">
              Generated with{" "}
              <span className="font-medium text-[var(--foreground)]">
                {letter.provider}
              </span>{" "}
              · {new Date(letter.createdAt).toLocaleString()}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ThemeToggle
                value={theme}
                onChange={onChangeTheme}
                disabled={themeBusy || exporting || busy}
              />
              <button
                type="button"
                onClick={onExport}
                disabled={exporting}
                className="rounded-md bg-[var(--foreground)] px-4 py-1.5 text-sm font-medium text-[var(--background)] disabled:opacity-50"
              >
                {exporting ? "Rendering PDF…" : "Download PDF"}
              </button>
            </div>
          </div>

          {keywords.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {keywords.map((k, i) => (
                <span
                  key={`${k}-${i}`}
                  className="rounded-full border border-[var(--border)] bg-[var(--muted)]/50 px-2.5 py-0.5 text-xs text-[var(--foreground)]"
                >
                  {k}
                </span>
              ))}
            </div>
          )}

          <div className="prose prose-sm max-w-none rounded-md border border-[var(--border)] bg-[var(--muted)]/30 p-4 text-sm text-[var(--foreground)]">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {letter.generatedMd}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </section>
  );
}
