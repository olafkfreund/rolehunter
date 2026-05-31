import Link from "next/link";
import type { Company } from "@/lib/db/schema";
import type { CompareRow } from "@/lib/companies/compare";

interface Props {
  current: Company;
  currentFitScore: number | null;
  currentDistanceKm: number | null;
  comparisons: CompareRow[];
}

function bandColor(score: number | null): string {
  if (score === null) return "var(--fg-4)";
  if (score >= 70) return "var(--ok)";
  if (score >= 50) return "var(--warn)";
  return "var(--danger)";
}

function diffMarker(currentVal: number | null, otherVal: number | null): string {
  if (currentVal === null || otherVal === null) return "—";
  if (currentVal === otherVal) return "=";
  return currentVal > otherVal ? "↑" : "↓";
}

export function CompanyCompareApplications({
  current,
  currentFitScore,
  currentDistanceKm,
  comparisons,
}: Props) {
  if (comparisons.length === 0) return null;

  const currentRating = current.glassdoorRating ? Number(current.glassdoorRating) : null;
  const currentRecommend = current.glassdoorRecommendPct ?? null;

  return (
    <section className="rise space-y-3" data-delay="8">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-[15px] font-semibold tracking-tight">
          <span className="section-label">compare to your applications</span>{" "}
          <span className="text-[var(--fg-4)] mono ml-2">{comparisons.length}</span>
        </h2>
      </div>
      <p className="text-[12px] text-[var(--fg-3)]">
        Side-by-side with every company you currently have an active application at
        (saved / applied / phone / onsite / offer). Markers (↑↓=) show how this company
        compares to each.
      </p>

      <div className="overflow-x-auto border border-[var(--border)] rounded-md">
        <table className="min-w-full text-[12px]">
          <thead className="text-[10px] uppercase tracking-wider text-[var(--fg-4)] bg-[var(--bg-elev)]">
            <tr>
              <th className="text-left px-3 py-2 font-normal">Company</th>
              <th className="text-left px-3 py-2 font-normal">Stage</th>
              <th className="text-right px-3 py-2 font-normal">Fit</th>
              <th className="text-right px-3 py-2 font-normal">Glassdoor</th>
              <th className="text-right px-3 py-2 font-normal">Recommend</th>
              <th className="text-right px-3 py-2 font-normal">Distance</th>
              <th className="text-right px-3 py-2 font-normal">Layoff</th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-[var(--bg-elev-2)] font-medium">
              <td className="px-3 py-2">
                <span className="text-[var(--accent)]">{current.name}</span>{" "}
                <span className="text-[10px] uppercase tracking-wider text-[var(--fg-4)]">
                  this company
                </span>
              </td>
              <td className="px-3 py-2 text-[var(--fg-4)]">—</td>
              <td
                className="text-right px-3 py-2 font-mono"
                style={{ color: bandColor(currentFitScore) }}
              >
                {currentFitScore ?? "—"}
              </td>
              <td className="text-right px-3 py-2 font-mono">
                {currentRating !== null ? `★ ${currentRating.toFixed(1)}` : "—"}
              </td>
              <td className="text-right px-3 py-2 font-mono">
                {currentRecommend !== null ? `${Math.round(currentRecommend)}%` : "—"}
              </td>
              <td className="text-right px-3 py-2 font-mono">
                {currentDistanceKm !== null
                  ? `${Math.round(currentDistanceKm).toLocaleString()} km`
                  : "—"}
              </td>
              <td className="text-right px-3 py-2">
                {current.hasRecentLayoff ? (
                  <span style={{ color: "var(--warn)" }}>⚠</span>
                ) : (
                  <span style={{ color: "var(--ok)" }}>●</span>
                )}
              </td>
            </tr>
            {comparisons.map((c) => {
              const r = c.company.glassdoorRating ? Number(c.company.glassdoorRating) : null;
              const rec = c.company.glassdoorRecommendPct ?? null;
              return (
                <tr key={c.applicationId} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2 truncate max-w-[200px]">
                    <Link
                      href={`/companies/${c.company.id}`}
                      className="hover:text-[var(--accent)]"
                    >
                      {c.company.name}
                    </Link>{" "}
                    <span className="text-[10px] text-[var(--fg-4)] block truncate">
                      {c.jobTitle}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="chip text-[10px] uppercase">
                      {c.stage.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td
                    className="text-right px-3 py-2 font-mono"
                    style={{ color: bandColor(c.fitScore) }}
                    title={`marker vs current: ${diffMarker(currentFitScore, c.fitScore)}`}
                  >
                    {c.fitScore ?? "—"}{" "}
                    <span className="text-[10px] text-[var(--fg-4)]">
                      {diffMarker(currentFitScore, c.fitScore)}
                    </span>
                  </td>
                  <td className="text-right px-3 py-2 font-mono">
                    {r !== null ? `★ ${r.toFixed(1)}` : "—"}{" "}
                    <span className="text-[10px] text-[var(--fg-4)]">
                      {diffMarker(currentRating, r)}
                    </span>
                  </td>
                  <td className="text-right px-3 py-2 font-mono">
                    {rec !== null ? `${Math.round(rec)}%` : "—"}{" "}
                    <span className="text-[10px] text-[var(--fg-4)]">
                      {diffMarker(currentRecommend, rec)}
                    </span>
                  </td>
                  <td className="text-right px-3 py-2 font-mono">
                    {c.distanceKm !== null
                      ? `${Math.round(c.distanceKm).toLocaleString()} km`
                      : "—"}{" "}
                    <span className="text-[10px] text-[var(--fg-4)]">
                      {diffMarker(
                        currentDistanceKm !== null ? -currentDistanceKm : null,
                        c.distanceKm !== null ? -c.distanceKm : null,
                      )}
                    </span>
                  </td>
                  <td className="text-right px-3 py-2">
                    {c.company.hasRecentLayoff ? (
                      <span style={{ color: "var(--warn)" }}>⚠</span>
                    ) : (
                      <span style={{ color: "var(--ok)" }}>●</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
