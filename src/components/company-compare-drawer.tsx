"use client";

import { useState } from "react";
import Link from "next/link";

interface CurrentCompany {
  id: number;
  name: string;
  headquarters: string | null;
  glassdoorRating: string | null;
  glassdoorRecommendPct: number | null;
  foundedYear: number | null;
  hasRecentLayoff: boolean;
  distanceKm: number | null;
}

interface CompareCandidate {
  id: number;
  name: string;
  glassdoorRating: string | null;
}

interface OtherCompanyDetails {
  id: number;
  name: string;
  headquarters: string | null;
  glassdoorRating: string | null;
  glassdoorRecommendPct: number | null;
  foundedYear: number | null;
  hasRecentLayoff: boolean;
  distanceKm: number | null;
}

interface CompareApiResponse {
  company: OtherCompanyDetails;
}

interface Props {
  current: CurrentCompany;
  candidates: CompareCandidate[];
}

export function CompanyCompareDrawer({ current, candidates }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [other, setOther] = useState<OtherCompanyDetails | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const filtered = filter
    ? candidates.filter((c) => c.name.toLowerCase().includes(filter.toLowerCase()))
    : candidates;

  async function pick(id: number) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/companies/${id}/compare`);
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        company?: OtherCompanyDetails;
      };
      if (!res.ok) {
        setErr(data.error ?? `HTTP ${res.status}`);
        return;
      }
      if (data.company) {
        setOther(data.company);
        setPickerOpen(false);
        setFilter("");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {!other && !pickerOpen && (
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="btn btn-ghost text-sm"
        >
          + Compare against another company
        </button>
      )}

      {pickerOpen && (
        <div className="card p-4 space-y-3 max-w-md">
          <div className="flex items-center justify-between">
            <div className="section-label">Pick a company</div>
            <button
              type="button"
              onClick={() => {
                setPickerOpen(false);
                setFilter("");
              }}
              className="btn btn-ghost text-xs"
            >
              ✕
            </button>
          </div>
          <input
            autoFocus
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter…"
            className="input w-full font-mono text-sm"
          />
          <ul className="max-h-60 overflow-y-auto divide-y divide-[var(--border)]">
            {filtered.slice(0, 50).map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => pick(c.id)}
                  disabled={busy}
                  className="w-full text-left px-2 py-2 hover:bg-[var(--bg-elev-2)] flex items-baseline justify-between gap-2"
                >
                  <span className="text-[13px]">{c.name}</span>
                  {c.glassdoorRating != null && (
                    <span className="text-[11px] font-mono text-[var(--accent)]">
                      ★ {Number(c.glassdoorRating).toFixed(1)}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {err && (
        <div
          className="rounded-md border px-3 py-2 text-xs"
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
        >
          {err}
        </div>
      )}

      {other && (
        <div className="grid sm:grid-cols-2 gap-3">
          <CompareColumn label="this company" data={current} muted={false} />
          <div className="relative">
            <CompareColumn label="comparison" data={other} muted={true} />
            <button
              type="button"
              onClick={() => {
                setOther(null);
                setPickerOpen(true);
              }}
              className="absolute top-3 right-3 btn btn-ghost text-[10px]"
            >
              swap
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CompareColumn({
  label,
  data,
  muted,
}: {
  label: string;
  data: CurrentCompany | OtherCompanyDetails;
  muted: boolean;
}) {
  const rows: Array<{ k: string; v: string }> = [
    { k: "Name", v: data.name },
    { k: "HQ", v: data.headquarters ?? "—" },
    { k: "Founded", v: data.foundedYear ? String(data.foundedYear) : "—" },
    {
      k: "Glassdoor",
      v: data.glassdoorRating != null ? `${Number(data.glassdoorRating).toFixed(1)} / 5` : "—",
    },
    {
      k: "Recommend",
      v: data.glassdoorRecommendPct != null ? `${data.glassdoorRecommendPct}%` : "—",
    },
    {
      k: "Distance",
      v: data.distanceKm != null ? `${Math.round(data.distanceKm).toLocaleString()} km` : "—",
    },
    { k: "Layoff", v: data.hasRecentLayoff ? "yes — recent" : "none on record" },
  ];

  return (
    <div className="card p-4 space-y-2" style={muted ? { opacity: 0.92 } : undefined}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="section-label">{label}</div>
        {"id" in data && (
          <Link
            href={`/companies/${data.id}`}
            className="text-[10px] text-[var(--accent)] hover:underline"
          >
            open ↗
          </Link>
        )}
      </div>
      <dl className="text-[12px] divide-y divide-[var(--border)]">
        {rows.map((r) => (
          <div key={r.k} className="flex items-baseline justify-between gap-3 py-1.5">
            <dt className="text-[10px] uppercase tracking-wider text-[var(--fg-4)]">{r.k}</dt>
            <dd className="font-mono text-[var(--fg-2)] text-right truncate">{r.v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
