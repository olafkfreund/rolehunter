import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getApplicationsForCompany,
  getCompanyById,
  getJobsForCompany,
  listCompanies,
} from "@/lib/repo/companies";
import {
  listBenefits,
  listConnections,
  listLayoffs,
  listNews,
  listOffices,
} from "@/lib/repo/company-siblings";
import { getCompanyFitScore } from "@/lib/companies/fit-score";
import { getProfile } from "@/lib/repo/profile";
import {
  resolveDistanceKm,
  resolveWorkLocation,
} from "@/lib/companies/work-location";
import type { Company } from "@/lib/db/schema";
import { CompanyCompareDrawer } from "@/components/company-compare-drawer";
import { CompanySiblingPanels } from "@/components/company-sibling-panels";
import { CompanyCompareApplications } from "@/components/company-compare-applications";
import { CompanyLogo } from "@/components/company-logo";
import { OfficeMap } from "@/components/office-map";
import { listApplicationCompanies } from "@/lib/companies/compare";

export const dynamic = "force-dynamic";

function formatStage(stage: string): string {
  return stage.replace(/_/g, " ");
}

function timeAgo(iso: Date | string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 30 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return `${Math.floor(diff / (30 * 86_400_000))}mo ago`;
}

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId) || !Number.isInteger(numericId) || numericId <= 0) {
    notFound();
  }
  const [company, profile] = await Promise.all([getCompanyById(numericId), getProfile()]);
  if (!company) notFound();

  const [
    jobs,
    apps,
    otherCompanies,
    news,
    layoffs,
    benefits,
    connections,
    offices,
    fit,
    applicationCompanies,
  ] = await Promise.all([
    getJobsForCompany(company.id),
    getApplicationsForCompany(company.id),
    listCompanies(),
    listNews(company.id, { limit: 15 }),
    listLayoffs(company.id),
    listBenefits(company.id),
    listConnections(company.id),
    listOffices(company.id),
    getCompanyFitScore(company.id),
    listApplicationCompanies(),
  ]);
  const otherApplicationCompanies = applicationCompanies.filter(
    (r) => r.company.id !== company.id,
  );

  // Distance from home — uses the right office (city-matched > closest >
  // HQ fallback) rather than always defaulting to HQ.
  const resolvedDistance = await resolveDistanceKm(company, profile);
  const distanceKm = resolvedDistance?.km ?? null;
  const workLocation = await resolveWorkLocation(company, profile);

  const compareCandidates = otherCompanies.filter((c) => c.id !== company.id);

  return (
    <div className="space-y-8">
      <nav className="text-[12px]">
        <Link
          href="/companies"
          className="text-[var(--fg-3)] hover:text-[var(--fg)]"
        >
          ← All companies
        </Link>
      </nav>

      <header className="space-y-3 rise" data-delay="1">
        <div className="section-label">company profile</div>
        <div className="flex items-start gap-4">
          <CompanyLogo
            src={company.logoUrl}
            name={company.name}
            className="w-16 h-16 rounded-md border border-[var(--border)] bg-[var(--bg-elev)] object-contain p-2 shrink-0"
          />
          <div className="min-w-0 flex-1">
            <h1 className="page-title">{company.name}</h1>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-[var(--fg-3)]">
              {company.headquarters && <span>HQ {company.headquarters}</span>}
              {company.foundedYear && <span>founded {company.foundedYear}</span>}
              {company.website && (
                <a
                  href={company.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--accent)] hover:underline"
                >
                  {new URL(company.website).host.replace(/^www\./, "")}
                </a>
              )}
              {company.wikidataId && (
                <a
                  href={`https://www.wikidata.org/wiki/${company.wikidataId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--fg-4)] hover:text-[var(--accent)] hover:underline"
                >
                  Wikidata ↗
                </a>
              )}
              {company.glassdoorUrl && (
                <a
                  href={company.glassdoorUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--fg-4)] hover:text-[var(--accent)] hover:underline"
                >
                  Glassdoor ↗
                </a>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Chip strip: ⭐ rating · 💰 — · 🚊 distance · ⚠ layoff */}
      <section className="rise" data-delay="2">
        <ChipStrip company={company} distanceKm={distanceKm} />
      </section>

      {workLocation && (
        <section className="rise space-y-2" data-delay="2">
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <div className="section-label">map · {workLocation.label}</div>
            {resolvedDistance && (
              <span className="text-[11px] font-mono text-[var(--fg-3)]">
                {Math.round(resolvedDistance.km).toLocaleString()} km from your home
                {resolvedDistance.source === "office-match-by-token" && " (city-matched)"}
                {resolvedDistance.source === "hq-fallback" &&
                  workLocation.office === null &&
                  " (HQ — no office in your area)"}
              </span>
            )}
          </div>
          <OfficeMap
            lat={workLocation.point.lat}
            lng={workLocation.point.lng}
            label={workLocation.label}
            homeLat={profile.homeLat}
            homeLng={profile.homeLng}
          />
        </section>
      )}

      {company.summary && (
        <section className="rise" data-delay="3">
          <div className="section-label mb-2">about</div>
          <p
            className="text-[15px] text-[var(--fg-2)] leading-relaxed max-w-3xl"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {company.summary}
          </p>
        </section>
      )}

      {company.glassdoorRating != null && (
        <section className="rise" data-delay="4">
          <div className="section-label mb-2">glassdoor</div>
          <div className="card p-5 space-y-4 max-w-3xl">
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-[var(--accent)] text-[28px] leading-none">★</span>
              <span className="text-[28px] font-medium font-mono">
                {Number(company.glassdoorRating).toFixed(1)}
              </span>
              <span className="text-[12px] text-[var(--fg-3)]">/ 5</span>
              {company.glassdoorReviewCount != null && (
                <span className="text-[12px] text-[var(--fg-4)] mono">
                  ({company.glassdoorReviewCount.toLocaleString()} reviews)
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-[var(--fg-2)]">
              {company.glassdoorRecommendPct != null && (
                <span>
                  <span className="mono text-[var(--fg)]">
                    {company.glassdoorRecommendPct}%
                  </span>{" "}
                  would recommend
                </span>
              )}
              {company.glassdoorCeoApprovalPct != null && (
                <span>
                  <span className="mono text-[var(--fg)]">
                    {company.glassdoorCeoApprovalPct}%
                  </span>{" "}
                  CEO approval
                </span>
              )}
            </div>
            {(company.glassdoorTopPro || company.glassdoorTopCon) && (
              <div className="grid sm:grid-cols-2 gap-4 pt-2 border-t border-[var(--border)]">
                {company.glassdoorTopPro && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-[var(--ok)] mb-1">
                      top pro
                    </div>
                    <div
                      className="text-[14px] text-[var(--fg-2)] leading-relaxed"
                      style={{ fontFamily: "var(--font-serif)" }}
                    >
                      {company.glassdoorTopPro}
                    </div>
                  </div>
                )}
                {company.glassdoorTopCon && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-[var(--warn)] mb-1">
                      top con
                    </div>
                    <div
                      className="text-[14px] text-[var(--fg-2)] leading-relaxed"
                      style={{ fontFamily: "var(--font-serif)" }}
                    >
                      {company.glassdoorTopCon}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {compareCandidates.length > 0 && (
        <section className="rise" data-delay="5">
          <div className="section-label mb-2">compare</div>
          <CompanyCompareDrawer
            current={{
              id: company.id,
              name: company.name,
              headquarters: company.headquarters,
              glassdoorRating: company.glassdoorRating,
              glassdoorRecommendPct: company.glassdoorRecommendPct,
              foundedYear: company.foundedYear,
              hasRecentLayoff: company.hasRecentLayoff,
              distanceKm,
            }}
            candidates={compareCandidates.map((c) => ({
              id: c.id,
              name: c.name,
              glassdoorRating: c.glassdoorRating,
            }))}
          />
        </section>
      )}

      <CompanySiblingPanels
        companyId={company.id}
        news={news}
        layoffs={layoffs}
        benefits={benefits}
        connections={connections}
        offices={offices}
        fitScore={fit}
      />

      <CompanyCompareApplications
        current={company}
        currentFitScore={fit?.score ?? null}
        currentDistanceKm={distanceKm}
        comparisons={otherApplicationCompanies}
      />

      <section className="rise" data-delay="6">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-[15px] font-semibold tracking-tight">
            <span className="section-label">jobs you've seen</span>{" "}
            <span className="text-[var(--fg-4)] mono ml-2">{jobs.length}</span>
          </h2>
        </div>
        {jobs.length === 0 ? (
          <div className="card p-6 text-[13px] text-[var(--fg-3)]">
            No job listings tagged to this company yet. They'll appear here as you click
            Enrich on /jobs/[id] pages or as the scheduler ingests new ones.
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-md overflow-hidden">
            {jobs.slice(0, 25).map((j) => (
              <li key={j.id} className="bg-[var(--bg-elev)]">
                <Link
                  href={`/jobs/${j.id}`}
                  className="block px-4 py-3 hover:bg-[var(--bg-elev-2)] transition-colors"
                >
                  <div className="flex items-baseline justify-between gap-3 flex-wrap">
                    <span className="font-medium text-[14px]">{j.title}</span>
                    <span className="text-[10px] font-mono text-[var(--fg-4)]">
                      {j.topScore !== null ? `score ${j.topScore}` : ""} · {j.source} · ingested{" "}
                      {timeAgo(j.fetchedAt)}
                    </span>
                  </div>
                  {j.location && (
                    <div className="mt-0.5 text-[11px] text-[var(--fg-3)]">{j.location}</div>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {jobs.length > 25 && (
          <div className="mt-2 text-[11px] text-[var(--fg-4)] font-mono">
            … and {jobs.length - 25} more
          </div>
        )}
      </section>

      {apps.length > 0 && (
        <section className="rise" data-delay="7">
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="text-[15px] font-semibold tracking-tight">
              <span className="section-label">applications in flight</span>{" "}
              <span className="text-[var(--fg-4)] mono ml-2">{apps.length}</span>
            </h2>
          </div>
          <ul className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-md overflow-hidden">
            {apps.map((a) => (
              <li key={a.id} className="bg-[var(--bg-elev)] px-4 py-3">
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <Link
                    href={`/jobs/${a.jobId}`}
                    className="font-medium text-[14px] hover:text-[var(--accent)]"
                  >
                    {a.jobTitle}
                  </Link>
                  <span className="chip text-[10px] uppercase">{formatStage(a.stage)}</span>
                </div>
                <div className="mt-0.5 text-[11px] font-mono text-[var(--fg-4)]">
                  updated {timeAgo(a.updatedAt)}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="text-[10px] text-[var(--fg-4)] font-mono pt-4 border-t border-[var(--border)]">
        cached {company.enrichmentSyncedAt
          ? new Date(company.enrichmentSyncedAt).toLocaleString()
          : "never"}
        {company.glassdoorSyncedAt && (
          <> · glassdoor {timeAgo(company.glassdoorSyncedAt)}</>
        )}
      </section>
    </div>
  );
}

function ChipStrip({
  company,
  distanceKm,
}: {
  company: Company;
  distanceKm: number | null;
}) {
  const chips: Array<{
    icon: string;
    label: string;
    detail?: string;
    color?: "ok" | "warn" | "danger";
  }> = [];

  if (company.glassdoorRating != null) {
    chips.push({
      icon: "★",
      label: Number(company.glassdoorRating).toFixed(1),
      detail: "Glassdoor",
    });
  }
  if (company.glassdoorRecommendPct != null) {
    chips.push({
      icon: "👍",
      label: `${company.glassdoorRecommendPct}%`,
      detail: "recommend",
    });
  }
  if (distanceKm != null) {
    chips.push({
      icon: "🚊",
      label: `${Math.round(distanceKm).toLocaleString()} km`,
      detail: "from home",
    });
  }
  if (company.hasRecentLayoff) {
    chips.push({ icon: "⚠", label: "Recent layoff", color: "warn" });
  }
  if (company.foundedYear) {
    const age = new Date().getFullYear() - company.foundedYear;
    chips.push({ icon: "🏛", label: `${age}y old`, detail: `est. ${company.foundedYear}` });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((c, i) => (
        <span
          key={i}
          className="inline-flex items-baseline gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-elev)] px-3 py-1.5 text-[12px]"
          style={
            c.color === "warn"
              ? {
                  borderColor: "var(--warn)",
                  background: "color-mix(in srgb, var(--warn) 8%, transparent)",
                }
              : undefined
          }
        >
          <span>{c.icon}</span>
          <span className="font-medium mono">{c.label}</span>
          {c.detail && <span className="text-[var(--fg-4)] text-[11px]">{c.detail}</span>}
        </span>
      ))}
    </div>
  );
}
