export function DashboardSkeleton({
  height = 120,
  label,
}: {
  height?: number;
  label?: string;
}) {
  return (
    <div
      className="animate-pulse rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 flex items-center justify-center text-xs text-[var(--muted-foreground)]"
      style={{ minHeight: height }}
      aria-label={label ?? "Loading"}
    >
      {label ?? "Loading…"}
    </div>
  );
}
