import type {
  CompanyBenefit,
  CompanyConnection,
  CompanyFitScore,
  CompanyLayoff,
  CompanyNewsItem,
  CompanyOffice,
} from "@/lib/db/schema";
import { OfficeAddForm } from "./office-add-form";

interface Breakdown {
  factors: Array<{
    key: string;
    label: string;
    weight: number;
    contribution: number;
    detail: string;
  }>;
  score: number;
  computedAt: string;
}

interface Props {
  companyId: number;
  news: CompanyNewsItem[];
  layoffs: CompanyLayoff[];
  benefits: CompanyBenefit[];
  connections: CompanyConnection[];
  offices: CompanyOffice[];
  fitScore: CompanyFitScore | null;
}

function timeAgo(iso: Date | string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 30 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return `${Math.floor(diff / (30 * 86_400_000))}mo ago`;
}

function bandColor(score: number): string {
  if (score >= 70) return "var(--ok)";
  if (score >= 50) return "var(--warn)";
  return "var(--danger)";
}

function newsKindColor(kind: string): string {
  switch (kind) {
    case "funding":
      return "var(--ok)";
    case "acquisition":
    case "ipo":
      return "var(--accent)";
    case "leadership":
      return "var(--fg-2)";
    default:
      return "var(--fg-3)";
  }
}

export function CompanySiblingPanels({
  companyId,
  news,
  layoffs,
  benefits,
  connections,
  offices,
  fitScore,
}: Props) {
  const breakdown = fitScore?.breakdownJson as unknown as Breakdown | null;
  // Offices section always renders (so the "Add office" affordance is always
  // reachable). Only suppress everything when every dataset is empty AND we
  // have no fit-score yet — but offices stays visible regardless.
  const fullyEmpty =
    news.length === 0 &&
    layoffs.length === 0 &&
    benefits.length === 0 &&
    connections.length === 0 &&
    offices.length === 0 &&
    !fitScore;

  if (fullyEmpty) {
    // Still render an offices stub so the user can add one manually.
    return (
      <section className="rise" data-delay="7">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-[15px] font-semibold tracking-tight">
            <span className="section-label">offices</span>{" "}
            <span className="text-[var(--fg-4)] mono ml-2">0</span>
          </h2>
          <OfficeAddForm companyId={companyId} />
        </div>
        <div className="text-[12px] text-[var(--fg-3)]">
          No offices on record yet. Click Enrich on the company panel to
          auto-extract them from the job listings you've ingested for this
          company, or add manually above.
        </div>
      </section>
    );
  }

  // Group benefits by category for cleaner rendering
  const benefitsByCategory = new Map<string, CompanyBenefit[]>();
  for (const b of benefits) {
    if (!benefitsByCategory.has(b.category)) benefitsByCategory.set(b.category, []);
    benefitsByCategory.get(b.category)!.push(b);
  }

  return (
    <div className="space-y-6">
      {fitScore && breakdown && (
        <section className="card p-5 space-y-3 rise" data-delay="5">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <div>
              <div className="section-label">Per-company fit score</div>
              <p className="text-[12px] text-[var(--fg-3)] mt-1">
                Weighted across cached signals — Glassdoor, layoff history, distance,
                benefit-priorities coverage. Refresh by enriching the company.
              </p>
            </div>
            <div
              className="flex items-baseline gap-2 rounded-md border px-3 py-1.5"
              style={{ borderColor: bandColor(fitScore.score) }}
            >
              <span className="text-[10px] uppercase tracking-wider text-[var(--fg-3)]">
                score
              </span>
              <span
                className="text-[26px] font-mono leading-none"
                style={{ color: bandColor(fitScore.score) }}
              >
                {fitScore.score}
              </span>
            </div>
          </div>
          <div className="space-y-1.5">
            {breakdown.factors.map((f) => (
              <div
                key={f.key}
                className="grid grid-cols-[140px_1fr_56px] gap-3 items-center text-[12px] border-l-2 pl-3 py-1"
                style={{ borderColor: bandColor(f.contribution) }}
              >
                <div className="font-medium">{f.label}</div>
                <div className="text-[11px] text-[var(--fg-3)]">{f.detail}</div>
                <div
                  className="text-[14px] font-mono leading-none px-2 py-1 rounded-md text-center"
                  style={{
                    color: bandColor(f.contribution),
                    background: `color-mix(in srgb, ${bandColor(f.contribution)} 12%, transparent)`,
                  }}
                >
                  {f.contribution}
                </div>
              </div>
            ))}
          </div>
          <div className="text-[10px] font-mono text-[var(--fg-4)]">
            cached {timeAgo(fitScore.computedAt)}
          </div>
        </section>
      )}

      {news.length > 0 && (
        <section className="rise" data-delay="6">
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="text-[15px] font-semibold tracking-tight">
              <span className="section-label">news & events</span>{" "}
              <span className="text-[var(--fg-4)] mono ml-2">{news.length}</span>
            </h2>
          </div>
          <ul className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-md overflow-hidden">
            {news.slice(0, 15).map((n) => (
              <li key={n.id} className="bg-[var(--bg-elev)] px-4 py-3">
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <a
                      href={n.url ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-[14px] hover:text-[var(--accent)] hover:underline"
                    >
                      {n.title}
                    </a>
                    {n.summary && (
                      <div className="mt-0.5 text-[12px] text-[var(--fg-3)] line-clamp-2">
                        {n.summary}
                      </div>
                    )}
                  </div>
                  <span
                    className="chip text-[10px] uppercase shrink-0"
                    style={{ color: newsKindColor(n.kind) }}
                  >
                    {n.kind}
                  </span>
                </div>
                <div className="mt-1 text-[10px] font-mono text-[var(--fg-4)]">
                  {n.publishedAt ? timeAgo(n.publishedAt) : "—"} · {n.source ?? "news"}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {layoffs.length > 0 && (
        <section className="rise" data-delay="6">
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="text-[15px] font-semibold tracking-tight">
              <span className="section-label">layoff history</span>{" "}
              <span className="text-[var(--fg-4)] mono ml-2">{layoffs.length}</span>
            </h2>
          </div>
          <ul className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-md overflow-hidden">
            {layoffs.map((l) => (
              <li key={l.id} className="bg-[var(--bg-elev)] px-4 py-3">
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <span className="font-mono text-[12px]">
                    {l.announcedAt
                      ? new Date(l.announcedAt).toLocaleDateString()
                      : "unknown date"}
                  </span>
                  {l.affectedCount && (
                    <span className="font-mono text-[12px]" style={{ color: "var(--warn)" }}>
                      ~{l.affectedCount.toLocaleString()} affected
                      {l.percentOfWorkforce && (
                        <> · {Number(l.percentOfWorkforce).toFixed(1)}%</>
                      )}
                    </span>
                  )}
                </div>
                {l.summary && (
                  <div className="mt-1 text-[12px] text-[var(--fg-3)]">{l.summary}</div>
                )}
                {l.sourceUrl && (
                  <a
                    href={l.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] font-mono text-[var(--accent)] hover:underline"
                  >
                    source ↗
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {benefitsByCategory.size > 0 && (
        <section className="rise" data-delay="7">
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="text-[15px] font-semibold tracking-tight">
              <span className="section-label">benefits</span>{" "}
              <span className="text-[var(--fg-4)] mono ml-2">{benefits.length}</span>
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {Array.from(benefitsByCategory.entries()).map(([cat, list]) => (
              <div key={cat} className="card p-3 space-y-2">
                <div className="text-[11px] uppercase tracking-wider text-[var(--accent)] font-mono">
                  {cat}
                </div>
                <ul className="space-y-1.5">
                  {list.map((b) => (
                    <li key={b.id} className="text-[12px]">
                      <span className="text-[var(--fg-2)]">{b.description}</span>
                      {b.valueText && (
                        <span className="text-[var(--fg-4)] font-mono ml-1.5">
                          ({b.valueText})
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {connections.length > 0 && (
        <section className="rise" data-delay="7">
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="text-[15px] font-semibold tracking-tight">
              <span className="section-label">your network here</span>{" "}
              <span className="text-[var(--fg-4)] mono ml-2">{connections.length}</span>
            </h2>
          </div>
          <ul className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-md overflow-hidden">
            {connections.slice(0, 20).map((c) => (
              <li key={c.id} className="bg-[var(--bg-elev)] px-4 py-3">
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    {c.linkedinUrl ? (
                      <a
                        href={c.linkedinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-[13px] hover:text-[var(--accent)]"
                      >
                        {c.name || "(no name)"}
                      </a>
                    ) : (
                      <span className="font-medium text-[13px]">
                        {c.name || "(no name)"}
                      </span>
                    )}
                    {c.headline && (
                      <div className="text-[11px] text-[var(--fg-3)]">{c.headline}</div>
                    )}
                  </div>
                  <span className="chip text-[10px] uppercase shrink-0">
                    {c.kind.replace(/_/g, " ")}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rise" data-delay="7">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-[15px] font-semibold tracking-tight">
            <span className="section-label">offices</span>{" "}
            <span className="text-[var(--fg-4)] mono ml-2">{offices.length}</span>
          </h2>
          <OfficeAddForm companyId={companyId} />
        </div>
        {offices.length === 0 && (
          <div className="text-[12px] text-[var(--fg-3)] mb-2">
            No offices on record yet. Auto-extracted from job listings on next
            enrich; add manually if you want a specific location matched for
            the commute calculation.
          </div>
        )}
        {offices.length > 0 && (
          <div>
            <ul className="grid sm:grid-cols-2 gap-3">
              {offices.map((o) => (
                <li key={o.id} className="card p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium text-[13px]">{o.label || "Office"}</span>
                    {o.lat != null && o.lng != null && (
                      <span className="text-[10px] font-mono text-[var(--fg-4)]">
                        {o.lat.toFixed(3)}, {o.lng.toFixed(3)}
                      </span>
                    )}
                  </div>
                  {o.address && (
                    <div className="mt-0.5 text-[12px] text-[var(--fg-3)]">{o.address}</div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
