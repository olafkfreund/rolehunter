import Link from "next/link";
import { listCompanies } from "@/lib/repo/companies";
import { CompanyLogo } from "@/components/company-logo";
import { RefreshOfficesButton } from "@/components/refresh-offices-button";

export const dynamic = "force-dynamic";

function timeAgo(iso: Date | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  if (diff < 30 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d`;
  return `${Math.floor(diff / (30 * 86_400_000))}mo`;
}

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").slice(0, 200);
  const companies = await listCompanies({ q });

  return (
    <div className="space-y-6">
      <section className="rise" data-delay="1">
        <div className="section-label mb-2">vol. iii · employer dossier</div>
        <h1 className="page-title">
          <span>Companies</span>
          <span
            className="ml-3 text-[var(--fg-4)] font-normal"
            style={{ fontFamily: "var(--font-sans)", fontSize: "0.5em", verticalAlign: "middle" }}
          >
            <span className="mono">{companies.length}</span>
          </span>
        </h1>
        <p className="subtitle mt-2">
          Companies you've enriched from <Link href="/jobs" className="text-[var(--accent)] hover:underline">/jobs</Link>.
          Each card opens a full profile — description, HQ, distance, Glassdoor signals, jobs you've seen, applications in flight.
        </p>
      </section>

      <div className="rise flex flex-wrap gap-3 items-center" data-delay="2">
        <form className="flex-1 min-w-[200px]">
          <input
            name="q"
            defaultValue={q}
            placeholder="Filter by name or HQ…"
            className="input w-full max-w-md font-mono text-sm"
          />
        </form>
        {companies.length > 0 && <RefreshOfficesButton />}
      </div>

      {companies.length === 0 ? (
        <div className="card p-12 text-center rise" data-delay="3">
          <div className="section-label mb-2">empty set</div>
          <div className="text-[var(--fg-3)] text-sm">
            {q
              ? "No companies match that filter."
              : "No companies enriched yet. Open any job's detail page and click Enrich on the \"Should you work here?\" panel."}
          </div>
        </div>
      ) : (
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 rise" data-delay="3">
          {companies.map((c) => (
            <li key={c.id}>
              <Link
                href={`/companies/${c.id}`}
                className="card p-4 block hover:bg-[var(--bg-elev-2)] transition-colors group"
              >
                <div className="flex items-start gap-3">
                  <CompanyLogo src={c.logoUrl} name={c.name} />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-[14px] tracking-tight truncate group-hover:text-[var(--accent)] transition-colors">
                      {c.name}
                    </div>
                    {c.headquarters && (
                      <div className="text-[11px] text-[var(--fg-3)] mt-0.5 truncate">
                        {c.headquarters}
                      </div>
                    )}
                  </div>
                  {c.glassdoorRating != null && (
                    <div className="shrink-0 text-[11px] mono text-[var(--accent)]">
                      ★ {Number(c.glassdoorRating).toFixed(1)}
                    </div>
                  )}
                </div>
                <div className="mt-3 flex items-center justify-between text-[10px] font-mono text-[var(--fg-4)]">
                  <span>
                    <span className="text-[var(--fg-3)]">{c.jobCount}</span> job
                    {c.jobCount === 1 ? "" : "s"}
                  </span>
                  <span>enriched {timeAgo(c.enrichmentSyncedAt)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
