export function scoreColor(score: number): string {
  if (score >= 80) return "var(--success)";
  if (score >= 60) return "var(--warning)";
  return "var(--danger)";
}

export function ScoreGauge({
  score,
  size = 120,
  strokeWidth,
  showLabel = true,
  className,
}: {
  score: number;
  size?: number;
  strokeWidth?: number;
  showLabel?: boolean;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  // Default stroke scales with size if not provided (preserving 10/120 ratio)
  const sw = strokeWidth ?? Math.max(2, Math.round((size / 120) * 10));
  const radius = (size - sw) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clamped / 100);
  const color = scoreColor(clamped);

  // Scale the score number font with the gauge size.
  const scoreFontPx = Math.max(10, Math.round(size * 0.28));
  const subFontPx = Math.max(8, Math.round(size * 0.1));

  return (
    <div
      className={`relative ${className ?? ""}`.trim()}
      style={{ width: size, height: size }}
    >
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
          strokeWidth={sw}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{
            transition: "stroke-dashoffset 500ms ease-out",
          }}
        />
      </svg>
      {showLabel && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="font-bold leading-none"
            style={{ color, fontSize: `${scoreFontPx}px` }}
          >
            {clamped}
          </span>
          <span
            className="mt-1 text-[var(--muted-foreground)]"
            style={{ fontSize: `${subFontPx}px` }}
          >
            /100
          </span>
        </div>
      )}
    </div>
  );
}
