"use client";

import { useState } from "react";
import type { CvMaster } from "@/lib/db/schema";
import { Markdown } from "@/components/markdown";

type Tab = "ats" | "gaps" | "rewrite" | "templates";

interface AtsCheck {
  id: string;
  label: string;
  severity: "ok" | "warn" | "err";
  detail: string;
}

interface AtsReport {
  score: number;
  checks: AtsCheck[];
  llmSummary?: string;
}

interface GapResult {
  targetRole: string;
  score: number;
  strengths: string[];
  gaps: string[];
  reasoning: string;
}

interface RewriteResult {
  section: string;
  guidance: string;
  rewritten: string;
}

export function CvWorkshop({ cv }: { cv: CvMaster }) {
  const [tab, setTab] = useState<Tab>("ats");

  return (
    <div className="space-y-4">
      <nav className="flex items-center gap-1 border-b border-[var(--border)]">
        {(
          [
            { id: "ats", label: "ATS Check" },
            { id: "gaps", label: "Gap Scan" },
            { id: "rewrite", label: "Rewrite" },
            { id: "templates", label: "Templates" },
          ] as { id: Tab; label: string }[]
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className="px-4 py-2 text-[13px] transition-colors border-b-2 -mb-px"
            style={{
              color: tab === t.id ? "var(--fg)" : "var(--fg-3)",
              borderColor: tab === t.id ? "var(--accent)" : "transparent",
              fontWeight: tab === t.id ? 500 : 400,
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-4">
        <CvPreview cv={cv} />
        <div className="space-y-4">
          {tab === "ats" && <AtsPanel />}
          {tab === "gaps" && <GapsPanel />}
          {tab === "rewrite" && <RewritePanel />}
          {tab === "templates" && <TemplatesPanel />}
        </div>
      </div>
    </div>
  );
}

function CvPreview({ cv }: { cv: CvMaster }) {
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-[var(--border)] px-4 py-2 flex items-center justify-between">
        <div className="section-label">active cv</div>
        <span className="text-[10px] text-[var(--fg-4)] font-mono uppercase tracking-wider">
          {cv.title}
        </span>
      </div>
      <pre className="p-4 text-[12px] leading-[1.55] whitespace-pre-wrap font-sans overflow-y-auto max-h-[70vh] text-[var(--fg-2)]">
        {cv.rawMarkdown}
      </pre>
    </div>
  );
}

function AtsPanel() {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<AtsReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [targetRole, setTargetRole] = useState("");

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/cv/ats-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ includeLlm: true, targetRole: targetRole || undefined }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? `Failed (${res.status})`);
        return;
      }
      setReport(await res.json());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-3">
        <div className="section-label">ats check</div>
        <p className="text-[12px] text-[var(--fg-3)] leading-relaxed">
          Local heuristics test contact info, skills section, dates, length, table-safety, and
          quantified bullets. The LLM adds prose-quality feedback. Both run on-demand.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={targetRole}
            onChange={(e) => setTargetRole(e.target.value)}
            placeholder="Target role (optional, helps LLM)"
            className="flex-1"
          />
          <button type="button" onClick={run} disabled={busy} className="btn btn-primary">
            {busy ? "scanning…" : "run check"}
          </button>
        </div>
        {error && (
          <div className="rounded-sm border border-[var(--err)] bg-red-500/5 px-3 py-2 text-[12px] text-[var(--err)]">
            {error}
          </div>
        )}
      </div>

      {report && (
        <>
          <div className="card p-4 flex items-center justify-between">
            <div>
              <div className="section-label">overall score</div>
              <div
                className="mono text-[var(--accent)] mt-1"
                style={{ fontSize: "var(--t-3xl)", fontWeight: 500, letterSpacing: "-0.04em" }}
              >
                {report.score}
                <span className="text-[var(--fg-4)] text-[20px] ml-1">/100</span>
              </div>
            </div>
            <div className="text-right text-[11px] text-[var(--fg-4)] font-mono uppercase tracking-wider">
              {report.checks.filter((c) => c.severity === "ok").length} ok
              <br />
              {report.checks.filter((c) => c.severity === "warn").length} warn
              <br />
              {report.checks.filter((c) => c.severity === "err").length} err
            </div>
          </div>

          <ul className="space-y-1.5">
            {report.checks.map((c) => (
              <li key={c.id} className="card p-3 flex items-start gap-3">
                <span className={`dot ${c.severity === "ok" ? "ok" : c.severity === "warn" ? "warn" : "err"} mt-1.5`} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium">{c.label}</div>
                  <div className="text-[12px] text-[var(--fg-3)] mt-0.5">{c.detail}</div>
                </div>
              </li>
            ))}
          </ul>

          {report.llmSummary && (
            <div className="card p-4 space-y-2">
              <div className="section-label">llm review</div>
              <Markdown>{report.llmSummary}</Markdown>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function GapsPanel() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GapResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [targetRole, setTargetRole] = useState("Senior Site Reliability Engineer");
  const [jd, setJd] = useState("");

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/cv/scan-gaps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetRole,
          jobDescription: jd.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? `Failed (${res.status})`);
        return;
      }
      setResult(await res.json());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-3">
        <div className="section-label">gap scan</div>
        <p className="text-[12px] text-[var(--fg-3)] leading-relaxed">
          Match your CV against a target role. Paste a JD for precise gaps, or leave it blank
          for a generic gap scan against the role title.
        </p>
        <input
          type="text"
          value={targetRole}
          onChange={(e) => setTargetRole(e.target.value)}
          placeholder="Target role title"
          className="w-full"
        />
        <textarea
          value={jd}
          onChange={(e) => setJd(e.target.value)}
          placeholder="Paste JD here (optional)…"
          rows={4}
          className="w-full font-mono text-[12px]"
        />
        <button type="button" onClick={run} disabled={busy} className="btn btn-primary">
          {busy ? "scanning…" : "scan gaps"}
        </button>
        {error && (
          <div className="rounded-sm border border-[var(--err)] bg-red-500/5 px-3 py-2 text-[12px] text-[var(--err)]">
            {error}
          </div>
        )}
      </div>

      {result && (
        <>
          <div className="card p-4 flex items-center justify-between">
            <div>
              <div className="section-label">match score</div>
              <div
                className="mono text-[var(--accent)] mt-1"
                style={{ fontSize: "var(--t-3xl)", fontWeight: 500, letterSpacing: "-0.04em" }}
              >
                {result.score}
                <span className="text-[var(--fg-4)] text-[20px] ml-1">/100</span>
              </div>
            </div>
            <span
              className="italic text-[var(--fg-3)] text-right text-[12px] max-w-[200px]"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              against {result.targetRole}
            </span>
          </div>

          {result.strengths.length > 0 && (
            <div className="card p-4 space-y-2">
              <div className="section-label">strengths</div>
              <ul className="space-y-1">
                {result.strengths.map((s, i) => (
                  <li key={i} className="text-[12px] text-[var(--fg-2)] flex items-start gap-2">
                    <span className="dot ok mt-1.5" />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.gaps.length > 0 && (
            <div className="card p-4 space-y-2">
              <div className="section-label">gaps to address</div>
              <ul className="space-y-1">
                {result.gaps.map((g, i) => (
                  <li key={i} className="text-[12px] text-[var(--fg-2)] flex items-start gap-2">
                    <span className="dot warn mt-1.5" />
                    <span>{g}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.reasoning && (
            <div className="card p-4 space-y-2">
              <div className="section-label">reasoning</div>
              <Markdown>{result.reasoning}</Markdown>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function RewritePanel() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RewriteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<RewriteResult["section"]>("summary");
  const [guidance, setGuidance] = useState("Make it sharper. Quantify the impact. Avoid LLM-tells.");
  const [targetRole, setTargetRole] = useState("");

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/cv/rewrite-section", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, guidance, targetRole: targetRole || undefined }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? `Failed (${res.status})`);
        return;
      }
      setResult(await res.json());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-3">
        <div className="section-label">section rewrite</div>
        <p className="text-[12px] text-[var(--fg-3)] leading-relaxed">
          Pick a section, describe the change you want, and get an LLM rewrite. Banned LLM-tell
          phrases are baked into the system prompt.
        </p>
        <div className="flex gap-2 flex-wrap">
          {(["summary", "skills", "experience", "education", "all"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSection(s)}
              className="chip"
              data-active={section === s}
            >
              {s}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={targetRole}
          onChange={(e) => setTargetRole(e.target.value)}
          placeholder="Target role (optional)"
          className="w-full"
        />
        <textarea
          value={guidance}
          onChange={(e) => setGuidance(e.target.value)}
          rows={3}
          className="w-full text-[12px]"
        />
        <button type="button" onClick={run} disabled={busy} className="btn btn-primary">
          {busy ? "rewriting…" : "rewrite section"}
        </button>
        {error && (
          <div className="rounded-sm border border-[var(--err)] bg-red-500/5 px-3 py-2 text-[12px] text-[var(--err)]">
            {error}
          </div>
        )}
      </div>

      {result && (
        <div className="card p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="section-label">rewrite · {result.section}</div>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(result.rewritten)}
              className="btn text-[11px]"
            >
              copy raw markdown
            </button>
          </div>
          <div className="max-h-[50vh] overflow-y-auto pr-1">
            <Markdown>{result.rewritten}</Markdown>
          </div>
        </div>
      )}
    </div>
  );
}

function TemplatesPanel() {
  const templates = [
    { id: "modern", label: "Modern", desc: "Sans-serif body, generous whitespace, single column. ATS-safe." },
    { id: "editorial", label: "Editorial", desc: "Fraunces serif headings, dense layout. For senior IC roles." },
    { id: "compact", label: "Compact", desc: "Tighter spacing, denser type. For >8 years experience." },
    { id: "minimal", label: "Minimal", desc: "Black on white, no colors. Maximum ATS parser compatibility." },
  ];

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-2">
        <div className="section-label">templates</div>
        <p className="text-[12px] text-[var(--fg-3)] leading-relaxed">
          Pick a layout for the rendered PDF. Templates affect{" "}
          <span className="italic" style={{ fontFamily: "var(--font-serif)" }}>
            visual style only
          </span>{" "}
          — content stays the same. Applied via{" "}
          <code className="font-mono text-[11px] text-[var(--fg-2)] bg-[var(--bg-elev-2)] px-1 rounded">
            theme
          </code>{" "}
          field on each <code className="font-mono text-[11px] text-[var(--fg-2)] bg-[var(--bg-elev-2)] px-1 rounded">cv_variant</code>.
        </p>
      </div>

      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {templates.map((t) => (
          <li key={t.id} className="card p-4">
            <div className="flex items-baseline justify-between">
              <div className="text-[14px] font-medium">{t.label}</div>
              <span className="font-mono text-[10px] text-[var(--fg-4)]">{t.id}</span>
            </div>
            <div className="mt-2 text-[12px] text-[var(--fg-3)] leading-relaxed">{t.desc}</div>
            <div className="mt-3 text-[10px] italic text-[var(--fg-4)]" style={{ fontFamily: "var(--font-serif)" }}>
              full PDF render arrives in a follow-up — currently you can select via the per-job CV variant flow
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
