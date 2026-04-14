"use client";

import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { FeedbackAnalysis, Provider } from "@/lib/llm/types";
import { ProviderToggle } from "./provider-toggle";

type Count = { category: string; count: number };

type Props = {
  initialCounts: Count[];
};

// Must stay in sync with feedback-list colour logic.
const CATEGORY_COLOR: Record<string, string> = {
  resume_screen: "var(--muted-foreground)",
  technical: "var(--warning)",
  behavioral: "var(--warning)",
  culture: "var(--accent)",
  salary: "var(--muted-foreground)",
  position_closed: "var(--muted-foreground)",
  other: "var(--muted-foreground)",
};

const CATEGORY_LABEL: Record<string, string> = {
  resume_screen: "Resume screen",
  technical: "Technical",
  behavioral: "Behavioral",
  culture: "Culture",
  salary: "Salary",
  position_closed: "Position closed",
  other: "Other",
};

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
): string {
  const start = {
    x: cx + r * Math.cos(startAngle),
    y: cy + r * Math.sin(startAngle),
  };
  const end = {
    x: cx + r * Math.cos(endAngle),
    y: cy + r * Math.sin(endAngle),
  };
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

function Donut({ counts }: { counts: Count[] }) {
  const size = 160;
  const stroke = 22;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;

  const total = counts.reduce((acc, c) => acc + c.count, 0);

  if (total === 0) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="var(--border)"
          strokeWidth={stroke}
        />
      </svg>
    );
  }

  // Single slice case: full circle.
  if (counts.length === 1) {
    const c = counts[0];
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={CATEGORY_COLOR[c.category] ?? "var(--muted-foreground)"}
          strokeWidth={stroke}
        />
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          fill="var(--foreground)"
          fontSize="18"
          fontWeight="600"
        >
          {total}
        </text>
      </svg>
    );
  }

  let cursor = -Math.PI / 2;
  const paths = counts.map((c, i) => {
    const frac = c.count / total;
    const start = cursor;
    const end = cursor + frac * 2 * Math.PI;
    cursor = end;
    // Pull back slightly to show a small gap between arcs.
    const gap = 0.015;
    const adjStart = start + gap;
    const adjEnd = end - gap;
    const safeEnd = adjEnd < adjStart ? adjStart : adjEnd;
    return (
      <path
        key={`${c.category}-${i}`}
        d={describeArc(cx, cy, r, adjStart, safeEnd)}
        fill="none"
        stroke={CATEGORY_COLOR[c.category] ?? "var(--muted-foreground)"}
        strokeWidth={stroke}
        strokeLinecap="butt"
      />
    );
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {paths}
      <text
        x={cx}
        y={cy - 6}
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--foreground)"
        fontSize="18"
        fontWeight="600"
      >
        {total}
      </text>
      <text
        x={cx}
        y={cy + 14}
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--muted-foreground)"
        fontSize="10"
      >
        rejections
      </text>
    </svg>
  );
}

export function FeedbackPatternsCard({ initialCounts }: Props) {
  const [counts] = useState<Count[]>(initialCounts);
  const [provider, setProvider] = useState<Provider>("claude");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<FeedbackAnalysis | null>(null);
  const [notEnough, setNotEnough] = useState(false);

  const total = useMemo(
    () => counts.reduce((acc, c) => acc + c.count, 0),
    [counts],
  );

  async function onAnalyse() {
    setBusy(true);
    setError(null);
    setNotEnough(false);
    try {
      const res = await fetch(
        `/api/feedback/patterns?analyse=1&provider=${provider}`,
        { cache: "no-store" },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          typeof json?.error === "string" ? json.error : "Analysis failed",
        );
      }
      if (json?.analysis == null) {
        setAnalysis(null);
        setNotEnough(true);
      } else {
        setAnalysis(json.analysis as FeedbackAnalysis);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-5 rounded-lg border border-[var(--border)] bg-[var(--background)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Rejection patterns</h2>
          <p className="text-xs text-[var(--muted-foreground)]">
            Distribution across your logged rejection reasons.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ProviderToggle
            value={provider}
            onChange={setProvider}
            disabled={busy}
          />
          <button
            type="button"
            onClick={onAnalyse}
            disabled={busy || total < 2}
            className="rounded-md bg-[var(--foreground)] px-4 py-1.5 text-sm font-medium text-[var(--background)] disabled:opacity-50"
          >
            {busy ? "Analysing…" : "Analyse my feedback"}
          </button>
        </div>
      </div>

      {total < 2 ? (
        <div className="rounded-md border border-dashed border-[var(--border)] bg-[var(--muted)]/30 p-4 text-sm text-[var(--muted-foreground)]">
          Log at least 2 feedback entries to see patterns.
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-6">
          <Donut counts={counts} />
          <ul className="space-y-1.5">
            {counts.map((c) => (
              <li
                key={c.category}
                className="flex items-center gap-2 text-sm"
              >
                <span
                  className="inline-block h-3 w-3 rounded-sm"
                  style={{
                    backgroundColor:
                      CATEGORY_COLOR[c.category] ?? "var(--muted-foreground)",
                  }}
                />
                <span className="text-[var(--foreground)]">
                  {CATEGORY_LABEL[c.category] ?? c.category}
                </span>
                <span className="text-[var(--muted-foreground)]">
                  · {c.count}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {notEnough && (
        <div className="text-sm text-[var(--muted-foreground)]">
          Log at least 2 feedback entries to run analysis.
        </div>
      )}

      {error && <div className="text-sm text-[var(--danger)]">{error}</div>}

      {analysis && (
        <div className="space-y-4 border-t border-[var(--border)] pt-4">
          {analysis.patternsMd && (
            <div className="prose prose-sm max-w-none rounded-md border border-[var(--border)] bg-[var(--muted)]/30 p-4 text-sm text-[var(--foreground)]">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {analysis.patternsMd}
              </ReactMarkdown>
            </div>
          )}

          {analysis.weakAreas && analysis.weakAreas.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                Weak areas
              </div>
              <div className="flex flex-wrap gap-1.5">
                {analysis.weakAreas.map((w, i) => (
                  <span
                    key={`w-${i}`}
                    className="rounded-full bg-[var(--warning)]/10 px-2.5 py-1 text-xs text-[var(--warning)]"
                  >
                    {w}
                  </span>
                ))}
              </div>
            </div>
          )}

          {analysis.strongAreas && analysis.strongAreas.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                Strong areas
              </div>
              <div className="flex flex-wrap gap-1.5">
                {analysis.strongAreas.map((s, i) => (
                  <span
                    key={`s-${i}`}
                    className="rounded-full bg-[var(--success)]/10 px-2.5 py-1 text-xs text-[var(--success)]"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {analysis.recommendations &&
            analysis.recommendations.length > 0 && (
              <div>
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Recommendations
                </div>
                <ol className="list-inside list-decimal space-y-1 text-sm text-[var(--foreground)]">
                  {analysis.recommendations.map((rec, i) => (
                    <li key={`r-${i}`}>{rec}</li>
                  ))}
                </ol>
              </div>
            )}
        </div>
      )}
    </section>
  );
}
