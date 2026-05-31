"use client";

import { useState } from "react";
import type { Company } from "@/lib/db/schema";

interface ProfileGeo {
  homeLat: number | null;
  homeLng: number | null;
}

interface Props {
  jobId: number;
  initialCompany: Company | null;
  initialDistanceKm: number | null;
  profileHasHomeAddress: boolean;
}

export function CompanyPanel({
  jobId,
  initialCompany,
  initialDistanceKm,
  profileHasHomeAddress,
}: Props) {
  const [company, setCompany] = useState<Company | null>(initialCompany);
  const [distanceKm, setDistanceKm] = useState<number | null>(initialDistanceKm);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function enrich() {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch("/api/companies/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, force: !!company?.enrichmentSyncedAt }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        company?: Company;
        distanceKm?: number | null;
      };
      if (!res.ok) {
        setErr(data.error ?? `Enrichment failed (${res.status})`);
        return;
      }
      if (data.company) setCompany(data.company);
      if (data.distanceKm !== undefined) setDistanceKm(data.distanceKm ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-elev)] p-5 space-y-4">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <div>
          <div className="section-label">Should you work here?</div>
          <p className="text-[12px] text-[var(--fg-3)] mt-1">
            Free sources: Wikidata description, Clearbit logo, distance from your home.
            Glassdoor / Levels.fyi / commute time arrive in later slices.
          </p>
        </div>
        <button
          type="button"
          onClick={enrich}
          disabled={busy}
          className="btn btn-primary text-sm whitespace-nowrap"
        >
          {busy ? "Enriching…" : company?.enrichmentSyncedAt ? "Refresh" : "Enrich"}
        </button>
      </div>

      {err && (
        <div
          className="rounded-md border px-3 py-2 text-xs"
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
        >
          {err}
        </div>
      )}

      {!company && !busy && (
        <div className="text-[12px] text-[var(--fg-3)]">
          Click <strong>Enrich</strong> to pull a description, logo, headquarters, and
          straight-line distance from your home (if your address is set in /profile).
        </div>
      )}

      {company && (
        <div className="space-y-4">
          <header className="flex items-start gap-4">
            {company.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={company.logoUrl}
                alt={`${company.name} logo`}
                className="w-12 h-12 rounded-md border border-[var(--border)] bg-[var(--bg)] object-contain p-1"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <div className="w-12 h-12 rounded-md border border-[var(--border)] bg-[var(--bg)] flex items-center justify-center font-mono text-xl text-[var(--fg-3)]">
                {company.name.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-[16px] font-semibold tracking-tight">{company.name}</div>
              <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--fg-3)]">
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
              </div>
            </div>
          </header>

          {company.summary && (
            <p
              className="text-[13px] text-[var(--fg-2)] leading-relaxed"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {company.summary}
            </p>
          )}

          <div className="grid sm:grid-cols-2 gap-2 text-[12px]">
            {company.hasRecentLayoff ? (
              <div
                className="rounded-md border px-3 py-2 flex items-baseline gap-2"
                style={{
                  borderColor: "var(--warn)",
                  background: "color-mix(in srgb, var(--warn) 8%, transparent)",
                }}
              >
                <span>⚠</span>
                <div>
                  <div className="font-medium">Recent layoff</div>
                  {company.lastLayoffCount && (
                    <div className="text-[11px] text-[var(--fg-3)]">
                      ~{company.lastLayoffCount.toLocaleString()} affected
                      {company.lastLayoffAt &&
                        ` (${new Date(company.lastLayoffAt).toLocaleDateString()})`}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-[var(--border)] px-3 py-2 text-[var(--fg-3)] flex items-baseline gap-2">
                <span style={{ color: "var(--ok)" }}>●</span>
                <div>
                  <div>No recent layoff on record</div>
                  <div className="text-[10px] text-[var(--fg-4)]">
                    (layoffs.fyi adapter ships in a later slice)
                  </div>
                </div>
              </div>
            )}

            {distanceKm !== null ? (
              <div className="rounded-md border border-[var(--border)] px-3 py-2 flex items-baseline gap-2">
                <span>🚊</span>
                <div>
                  <div className="font-medium">
                    {Math.round(distanceKm).toLocaleString()} km from home
                  </div>
                  <div className="text-[10px] text-[var(--fg-4)]">
                    straight-line; commute time via Google Maps follows
                  </div>
                </div>
              </div>
            ) : profileHasHomeAddress ? (
              <div className="rounded-md border border-[var(--border)] px-3 py-2 text-[var(--fg-3)]">
                Distance unavailable — company HQ not geocoded.
              </div>
            ) : (
              <div className="rounded-md border border-[var(--border)] px-3 py-2 text-[var(--fg-3)]">
                Set your home address in{" "}
                <a href="/profile" className="text-[var(--accent)] hover:underline">
                  /profile
                </a>{" "}
                to see distance.
              </div>
            )}
          </div>

          {company.enrichmentSyncedAt && (
            <div className="text-[10px] text-[var(--fg-4)] font-mono">
              cached {new Date(company.enrichmentSyncedAt).toLocaleString()}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
