import type { ReactNode } from "react";

type Metrics = {
  totalApplied: number;
  responseRatePct: number;
  interviewRatePct: number;
  offerRatePct: number;
  avgScore: number | null;
};

type TileProps = {
  value: ReactNode;
  label: string;
  valueClassName?: string;
};

function Tile({ value, label, valueClassName }: TileProps) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/30 p-4">
      <div className={`text-2xl font-bold ${valueClassName ?? ""}`}>
        {value}
      </div>
      <div className="mt-1 text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
        {label}
      </div>
    </div>
  );
}

function formatPct(pct: number): string {
  const rounded = Math.round(pct);
  return `${rounded}%`;
}

export function MetricsStrip({ metrics }: { metrics: Metrics }) {
  const {
    totalApplied,
    responseRatePct,
    interviewRatePct,
    offerRatePct,
    avgScore,
  } = metrics;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <Tile value={totalApplied.toLocaleString()} label="applications" />
      <Tile value={formatPct(responseRatePct)} label="responses" />
      <Tile value={formatPct(interviewRatePct)} label="reached interview" />
      <Tile
        value={formatPct(offerRatePct)}
        label="offers"
        valueClassName={offerRatePct > 0 ? "text-[var(--success)]" : undefined}
      />
      <Tile
        value={avgScore === null ? "—" : Math.round(avgScore).toString()}
        label="avg match"
      />
    </div>
  );
}
