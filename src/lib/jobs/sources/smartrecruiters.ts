// SmartRecruiters adapter — public Posting API, no auth required.
// List:   https://api.smartrecruiters.com/v1/companies/{company}/postings?limit=100
// Detail: https://api.smartrecruiters.com/v1/companies/{company}/postings/{id}
//
// The list endpoint omits the job description, so each posting needs a detail
// fetch to populate the body (jobAd.sections.*). Detail fetches are bounded by
// params.maxResults — we stop once enough matching jobs are collected.
//
// Pattern (mirrors greenhouse.ts): profile.sources includes "smartrecruiters"
// AND params.targetCompanies is the list of SmartRecruiters company identifiers.
//
// See epic #111.

import { classifyAtsError, handleAtsHttpError, htmlToText, matchesLocation, matchesQuery } from "./ats-shared";
import { SourcePermanentError } from "./errors";
import type { JobSource, RawJob, RemoteMode, SearchParams } from "./types";

const BASE = "https://api.smartrecruiters.com/v1/companies";

interface SrLocation {
  city?: string;
  region?: string;
  country?: string;
  remote?: boolean;
}

interface SrPosting {
  id?: string;
  name?: string;
  releasedDate?: string;
  location?: SrLocation;
  department?: { label?: string };
  typeOfEmployment?: { label?: string };
  experienceLevel?: { label?: string };
  company?: { identifier?: string; name?: string };
}

interface SrListResponse {
  totalFound?: number;
  content?: SrPosting[];
}

interface SrSection {
  title?: string;
  text?: string;
}

interface SrDetail {
  jobAd?: {
    sections?: {
      companyDescription?: SrSection;
      jobDescription?: SrSection;
      qualifications?: SrSection;
      additionalInformation?: SrSection;
    };
  };
}

function locationRaw(loc: SrLocation | undefined): string | undefined {
  if (!loc) return undefined;
  const parts = [loc.city, loc.region, loc.country].filter(
    (s): s is string => !!s && s.length > 0,
  );
  return parts.length ? parts.join(", ") : undefined;
}

function descriptionFrom(detail: SrDetail): string {
  const s = detail.jobAd?.sections;
  if (!s) return "";
  const parts = [s.companyDescription, s.jobDescription, s.qualifications, s.additionalInformation]
    .filter((sec): sec is SrSection => !!sec && !!sec.text)
    .map((sec) => htmlToText(sec.text ?? ""));
  return parts.filter((p) => p.length > 0).join("\n\n");
}

export function createSmartRecruitersAdapter(): JobSource {
  return {
    id: "smartrecruiters",
    displayName: "SmartRecruiters (direct ATS)",
    available: async () => ({ ok: true }),
    costEstimate: () => 0,
    search: async (params: SearchParams, signal: AbortSignal): Promise<RawJob[]> => {
      const companies = params.targetCompanies ?? [];
      if (companies.length === 0) return [];

      const collected: RawJob[] = [];
      try {
        for (const company of companies) {
          if (signal.aborted) {
            throw new SourcePermanentError("aborted between SmartRecruiters companies");
          }
          const listUrl = `${BASE}/${encodeURIComponent(company)}/postings?limit=100`;
          const listRes = await fetch(listUrl, { signal, cache: "no-store" });
          if (!listRes.ok) {
            const text = await listRes.text().catch(() => "");
            if (handleAtsHttpError(listRes.status, text, listRes.statusText, "SmartRecruiters") === "skip") {
              continue;
            }
          }
          const list = (await listRes.json()) as SrListResponse;

          for (const p of list.content ?? []) {
            if (!p.id || !p.name) continue;
            if (signal.aborted) throw new SourcePermanentError("aborted mid-SmartRecruiters company");

            // Detail fetch for the description body.
            const detailUrl = `${BASE}/${encodeURIComponent(company)}/postings/${encodeURIComponent(p.id)}`;
            const detailRes = await fetch(detailUrl, { signal, cache: "no-store" });
            let description = "";
            if (detailRes.ok) {
              const detail = (await detailRes.json()) as SrDetail;
              description = descriptionFrom(detail);
            }

            const slug = p.company?.identifier || company;
            const remoteMode: RemoteMode | undefined = p.location?.remote === true ? "remote" : undefined;
            const raw: RawJob = {
              externalId: `${company}-${p.id}`,
              title: p.name,
              company: p.company?.name || company,
              location: { raw: locationRaw(p.location) },
              remoteMode,
              description,
              jobType: p.typeOfEmployment?.label,
              experienceLevel: p.experienceLevel?.label,
              postedAt: p.releasedDate,
              url: `https://jobs.smartrecruiters.com/${encodeURIComponent(slug)}/${encodeURIComponent(p.id)}`,
              rawSource: p,
            };

            if (!matchesQuery(raw, params.query)) continue;
            if (!matchesLocation(raw, params.location)) continue;
            collected.push(raw);
            if (collected.length >= params.maxResults) break;
          }
          if (collected.length >= params.maxResults) break;
        }
        return collected.slice(0, params.maxResults);
      } catch (err) {
        classifyAtsError(err, "smartrecruiters.search");
      }
    },
  };
}
