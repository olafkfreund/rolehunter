"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { CoverLetter, CoverLetterTemplate } from "@/lib/db/schema";
import type { Provider, GenerateHooksResult } from "@/lib/llm/types";
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

  // Modular Builder Options States
  const [customizing, setCustomizing] = useState(false);
  const [masterCv, setMasterCv] = useState<any | null>(null);
  const [selectedHookOption, setSelectedHookOption] = useState<string | null>(null);
  const [customHookText, setCustomHookText] = useState("");
  const [generatedHooks, setGeneratedHooks] = useState<GenerateHooksResult | null>(null);
  const [loadingHooks, setLoadingHooks] = useState(false);
  const [selectedEvidence, setSelectedEvidence] = useState<
    Array<{ type: "experience" | "project"; companyOrName: string; text: string }>
  >([]);
  const [ctaTone, setCtaTone] = useState("Direct & Confident");

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

        const [tRes, lRes, cvRes] = await Promise.all([
          fetch("/api/cover-letter-templates", { cache: "no-store" }),
          fetch(`/api/cover-letters?appId=${app.id}`, { cache: "no-store" }),
          fetch("/api/cv", { cache: "no-store" }),
        ]);
        const [tBody, lBody, cvJson] = await Promise.all([
          parseJsonSafe(tRes),
          parseJsonSafe(lRes),
          cvRes.json().catch(() => null),
        ]);
        if (cancelled) return;
        if (tRes.ok && Array.isArray(tBody)) {
          setTemplates(tBody as CoverLetterTemplate[]);
        }
        if (cvRes.ok && cvJson) {
          setMasterCv(cvJson);
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

            // Populate modular configs from database
            if (letters[0].selectedHook) {
              setCustomHookText(letters[0].selectedHook);
              setSelectedHookOption("custom");
            }
            if (letters[0].selectedEvidence) {
              setSelectedEvidence(letters[0].selectedEvidence as any[]);
            }
            if (letters[0].ctaTone) {
              setCtaTone(letters[0].ctaTone);
            }
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

  async function onGenerateHooks() {
    if (applicationId === null) return;
    setLoadingHooks(true);
    try {
      const res = await fetch("/api/cover-letters/generate-hooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId, provider }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate hooks");
      setGeneratedHooks(data as GenerateHooksResult);
      setSelectedHookOption("metric");
      setCustomHookText((data as GenerateHooksResult).metricHook);
      toast.success("Hooks generated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate hooks");
    } finally {
      setLoadingHooks(false);
    }
  }

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
          selectedHook: selectedHookOption ? customHookText : null,
          selectedEvidence: selectedEvidence.length > 0 ? selectedEvidence : null,
          ctaTone,
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
          <button
            type="button"
            onClick={() => setCustomizing(!customizing)}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--muted)] flex items-center gap-1.5 cursor-pointer"
          >
            Customize
            {customizing ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
          <ProviderToggle
            value={provider}
            onChange={setProvider}
            disabled={busy || exporting}
          />
          <button
            type="button"
            onClick={onGenerate}
            disabled={busy}
            className="rounded-md bg-[var(--foreground)] px-4 py-1.5 text-sm font-medium text-[var(--background)] disabled:opacity-50 cursor-pointer"
          >
            {busy
              ? "Generating…"
              : letter
                ? "Regenerate"
                : "Generate cover letter"}
          </button>
        </div>
      </div>

      {customizing && (
        <div className="border border-[var(--border)] rounded-lg bg-[var(--muted)]/10 p-4 space-y-4">
          <div className="border-b border-[var(--border)] pb-2">
            <h3 className="text-sm font-semibold">Modular Cover Letter Customizer</h3>
            <p className="text-xs text-[var(--muted-foreground)]">Fine-tune your hooks, evidence paragraphs, and closing call-to-actions.</p>
          </div>

          {/* 1. Hook Selection */}
          <div className="space-y-2">
            <label className="text-xs font-semibold block uppercase tracking-wider text-[var(--muted-foreground)]">1. Choose or Generate opening hook</label>
            {!generatedHooks ? (
              <button
                type="button"
                onClick={onGenerateHooks}
                disabled={loadingHooks || busy}
                className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-xs hover:bg-[var(--muted)] disabled:opacity-50 cursor-pointer"
              >
                {loadingHooks ? "Generating Hook Options..." : "AI Generate Hook Options"}
              </button>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  { id: "metric", label: "Metric-First", val: generatedHooks.metricHook },
                  { id: "company", label: "Company-Centric", val: generatedHooks.companyHook },
                  { id: "direct", label: "Direct & Confident", val: generatedHooks.directHook },
                ].map((hookOpt) => (
                  <div
                    key={hookOpt.id}
                    onClick={() => {
                      setSelectedHookOption(hookOpt.id);
                      setCustomHookText(hookOpt.val);
                    }}
                    className={`border rounded-lg p-3 text-xs cursor-pointer hover:border-[var(--foreground)] transition-all ${
                      selectedHookOption === hookOpt.id
                        ? "border-[var(--foreground)] bg-[var(--muted)]"
                        : "border-[var(--border)] bg-[var(--background)]"
                    }`}
                  >
                    <div className="font-semibold mb-1">{hookOpt.label}</div>
                    <p className="text-[var(--muted-foreground)]">{hookOpt.val}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Hook text editor */}
            {selectedHookOption && (
              <div className="space-y-1">
                <div className="text-[11px] text-[var(--muted-foreground)]">Edit Selected Hook:</div>
                <textarea
                  value={customHookText}
                  onChange={(e) => {
                    setSelectedHookOption("custom");
                    setCustomHookText(e.target.value);
                  }}
                  rows={2}
                  className="w-full text-xs p-2 rounded-md border border-[var(--border)] bg-[var(--background)] outline-none text-[var(--foreground)]"
                  placeholder="Paste or write your own custom hook here..."
                />
              </div>
            )}
          </div>

          {/* 2. Evidence (CV Bullets) Selection */}
          <div className="space-y-2 pt-2 border-t border-[var(--border)]/50">
            <label className="text-xs font-semibold block uppercase tracking-wider text-[var(--muted-foreground)]">
              2. Select CV Evidence to Highlight (Max 3)
            </label>
            {!masterCv ? (
              <p className="text-xs text-[var(--muted-foreground)]">No active CV loaded. Set one in Profile.</p>
            ) : (
              <div className="max-h-60 overflow-y-auto space-y-2 border border-[var(--border)] rounded bg-[var(--background)] p-3">
                {/* Master CV Experience */}
                {masterCv.parsedJson?.experience?.map((exp: any, expIdx: number) => (
                  <div key={`exp-${expIdx}`} className="space-y-1">
                    <div className="text-[10px] uppercase font-bold text-[var(--muted-foreground)] tracking-wide">
                      {exp.company} — {exp.title}
                    </div>
                    {exp.bullets?.map((bullet: string, bulIdx: number) => {
                      const isChecked = selectedEvidence.some(
                        (item) => item.type === "experience" && item.text === bullet
                      );
                      return (
                        <label
                          key={`bullet-${expIdx}-${bulIdx}`}
                          className="flex items-start gap-2 text-xs p-1.5 rounded hover:bg-[var(--muted)]/40 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              if (isChecked) {
                                setSelectedEvidence(
                                  selectedEvidence.filter(
                                    (item) => !(item.type === "experience" && item.text === bullet)
                                  )
                                );
                              } else {
                                if (selectedEvidence.length >= 3) {
                                  toast.error("Select up to 3 evidence items maximum");
                                  return;
                                }
                                setSelectedEvidence([
                                  ...selectedEvidence,
                                  { type: "experience", companyOrName: exp.company, text: bullet },
                                ]);
                              }
                            }}
                            className="mt-0.5"
                          />
                          <span className="text-[var(--foreground)]">{bullet}</span>
                        </label>
                      );
                    })}
                  </div>
                ))}

                {/* Master CV Projects */}
                {masterCv.parsedJson?.projects && masterCv.parsedJson.projects.length > 0 && (
                  <div className="space-y-1 pt-2 border-t border-[var(--border)]/30">
                    <div className="text-[10px] uppercase font-bold text-[var(--muted-foreground)] tracking-wide">
                      Projects
                    </div>
                    {masterCv.parsedJson.projects.map((proj: any, projIdx: number) => {
                      const textVal = `${proj.name}: ${proj.description}`;
                      const isChecked = selectedEvidence.some(
                        (item) => item.type === "project" && item.text === textVal
                      );
                      return (
                        <label
                          key={`proj-${projIdx}`}
                          className="flex items-start gap-2 text-xs p-1.5 rounded hover:bg-[var(--muted)]/40 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              if (isChecked) {
                                setSelectedEvidence(
                                  selectedEvidence.filter(
                                    (item) => !(item.type === "project" && item.text === textVal)
                                  )
                                );
                              } else {
                                if (selectedEvidence.length >= 3) {
                                  toast.error("Select up to 3 evidence items maximum");
                                  return;
                                }
                                setSelectedEvidence([
                                  ...selectedEvidence,
                                  { type: "project", companyOrName: proj.name, text: textVal },
                                ]);
                              }
                            }}
                            className="mt-0.5"
                          />
                          <span className="text-[var(--foreground)] font-semibold">{proj.name}:</span>
                          <span className="text-[var(--muted-foreground)]">{proj.description}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 3. CTA Tone */}
          <div className="space-y-2 pt-2 border-t border-[var(--border)]/50">
            <label className="text-xs font-semibold block uppercase tracking-wider text-[var(--muted-foreground)]">3. Closing Call-To-Action Tone</label>
            <div className="flex gap-2">
              {["Direct & Confident", "Conversational", "Traditional"].map((tone) => (
                <button
                  key={tone}
                  type="button"
                  onClick={() => setCtaTone(tone)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium border transition-colors cursor-pointer ${
                    ctaTone === tone
                      ? "bg-[var(--foreground)] text-[var(--background)] border-[var(--foreground)]"
                      : "bg-[var(--background)] text-[var(--muted-foreground)] border-[var(--border)] hover:text-[var(--foreground)]"
                  }`}
                >
                  {tone}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

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
