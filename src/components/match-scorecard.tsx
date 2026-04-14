import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Provider } from "@/lib/llm/types";

function timeAgo(input: Date | string): string {
  const then = typeof input === "string" ? new Date(input) : input;
  const diffMs = Date.now() - then.getTime();
  const s = Math.round(diffMs / 1000);
  if (s < 30) return "just now";
  if (s < 60) return `${s} seconds ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo} month${mo === 1 ? "" : "s"} ago`;
  const y = Math.round(mo / 12);
  return `${y} year${y === 1 ? "" : "s"} ago`;
}

function scoreColor(score: number): string {
  if (score >= 80) return "var(--success)";
  if (score >= 60) return "var(--warning)";
  return "var(--danger)";
}

export function MatchScorecard({
  score,
  strengths,
  gaps,
  reasoningMd,
  provider,
  createdAt,
}: {
  score: number;
  strengths: string[];
  gaps: string[];
  reasoningMd: string;
  provider: Provider;
  createdAt: Date | string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const size = 120;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clamped / 100);
  const color = scoreColor(clamped);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-5">
        <div className="relative" style={{ width: size, height: size }}>
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className="-rotate-90"
          >
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="var(--border)"
              strokeWidth={strokeWidth}
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              style={{
                transition: "stroke-dashoffset 700ms ease-out",
              }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span
              className="text-3xl font-bold leading-none"
              style={{ color }}
            >
              {clamped}
            </span>
            <span className="mt-1 text-xs text-[var(--muted-foreground)]">
              /100
            </span>
          </div>
        </div>

        <div className="flex-1 space-y-3 min-w-[200px]">
          {strengths.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                Strengths
              </div>
              <div className="flex flex-wrap gap-1.5">
                {strengths.map((s, i) => (
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
          {gaps.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                Gaps
              </div>
              <div className="flex flex-wrap gap-1.5">
                {gaps.map((g, i) => (
                  <span
                    key={`g-${i}`}
                    className="rounded-full bg-[var(--warning)]/10 px-2.5 py-1 text-xs text-[var(--warning)]"
                  >
                    {g}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {reasoningMd && (
        <div className="prose prose-sm max-w-none rounded-md border border-[var(--border)] bg-[var(--muted)]/30 p-4 text-sm text-[var(--foreground)]">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {reasoningMd}
          </ReactMarkdown>
        </div>
      )}

      <div className="text-xs text-[var(--muted-foreground)]">
        Scored with{" "}
        <span className="font-medium text-[var(--foreground)]">{provider}</span>{" "}
        · {timeAgo(createdAt)}
      </div>
    </div>
  );
}
