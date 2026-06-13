// ATS URL auto-detection for the Import-from-URL flow.
//
// A pasted careers/job URL on a known ATS host is far more reliably imported by
// hitting that ATS's JSON API than by scraping the (often JS-rendered) HTML.
// detectAtsUrl() maps a URL to {ats, slug, jobId}; fetchAtsSingle() pulls the
// one posting and normalises it. On any miss the caller falls back to the
// generic JSON-LD / HTML extractor.
//
// See epic #111 / issue #113.

import { htmlToText } from "./sources/ats-shared";

export type AtsKind = "greenhouse" | "lever" | "ashby" | "workable" | "smartrecruiters";

export interface AtsUrlMatch {
  ats: AtsKind;
  slug: string;
  jobId: string;
}

export interface AtsSingleJob {
  title: string;
  company: string;
  location: string;
  description: string;
  url: string;
  postedAt: string | null;
  employmentType: string | null;
}

function seg(pathname: string): string[] {
  return pathname.split("/").filter(Boolean);
}

/** Map a pasted URL to an ATS posting reference, or null if it isn't a known ATS host. */
export function detectAtsUrl(u: URL): AtsUrlMatch | null {
  const host = u.host.toLowerCase();
  const parts = seg(u.pathname);

  // Greenhouse: boards[.eu].greenhouse.io/{slug}/jobs/{id}, job-boards.greenhouse.io/{slug}/jobs/{id}
  if (host.endsWith("greenhouse.io")) {
    const jobsIdx = parts.indexOf("jobs");
    if (jobsIdx >= 1 && parts[jobsIdx + 1]) {
      return { ats: "greenhouse", slug: parts[jobsIdx - 1], jobId: parts[jobsIdx + 1] };
    }
    return null;
  }

  // Lever: jobs.lever.co/{slug}/{uuid}
  if (host === "jobs.lever.co") {
    if (parts[0] && parts[1]) return { ats: "lever", slug: parts[0], jobId: parts[1] };
    return null;
  }

  // Ashby: jobs.ashbyhq.com/{slug}/{uuid}
  if (host === "jobs.ashbyhq.com") {
    if (parts[0] && parts[1]) return { ats: "ashby", slug: parts[0], jobId: parts[1] };
    return null;
  }

  // Workable: apply.workable.com/{slug}/j/{CODE}, or {slug}.workable.com/j/{CODE}
  if (host === "apply.workable.com") {
    const jIdx = parts.indexOf("j");
    if (jIdx >= 1 && parts[jIdx + 1]) {
      return { ats: "workable", slug: parts[jIdx - 1], jobId: parts[jIdx + 1] };
    }
    return null;
  }
  if (host.endsWith(".workable.com")) {
    const jIdx = parts.indexOf("j");
    if (jIdx >= 0 && parts[jIdx + 1]) {
      return { ats: "workable", slug: host.replace(".workable.com", ""), jobId: parts[jIdx + 1] };
    }
    return null;
  }

  // SmartRecruiters: jobs.smartrecruiters.com/{Company}/{postingId}-{title-slug}
  if (host === "jobs.smartrecruiters.com" || host.endsWith(".smartrecruiters.com")) {
    if (parts[0] && parts[1]) {
      // postingId is the leading numeric run before the title slug.
      const m = parts[1].match(/^(\d+)/);
      return { ats: "smartrecruiters", slug: parts[0], jobId: m ? m[1] : parts[1] };
    }
    return null;
  }

  return null;
}

async function getJson(url: string, signal?: AbortSignal): Promise<unknown | null> {
  const res = await fetch(url, { signal, cache: "no-store", headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

/** Fetch + normalise a single posting from its ATS JSON API. Returns null on any miss. */
export async function fetchAtsSingle(m: AtsUrlMatch, signal?: AbortSignal): Promise<AtsSingleJob | null> {
  switch (m.ats) {
    case "greenhouse": {
      const j = (await getJson(
        `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(m.slug)}/jobs/${encodeURIComponent(m.jobId)}?questions=false`,
        signal,
      )) as { title?: string; location?: { name?: string }; content?: string; absolute_url?: string; updated_at?: string } | null;
      if (!j?.title) return null;
      return {
        title: j.title,
        company: m.slug,
        location: j.location?.name ?? "",
        description: htmlToText(j.content ?? ""),
        url: j.absolute_url ?? "",
        postedAt: j.updated_at ?? null,
        employmentType: null,
      };
    }
    case "lever": {
      const j = (await getJson(
        `https://api.lever.co/v0/postings/${encodeURIComponent(m.slug)}/${encodeURIComponent(m.jobId)}`,
        signal,
      )) as {
        text?: string;
        hostedUrl?: string;
        applyUrl?: string;
        descriptionPlain?: string;
        additionalPlain?: string;
        createdAt?: number;
        categories?: { location?: string; commitment?: string };
      } | null;
      if (!j?.text) return null;
      const description = [j.descriptionPlain, j.additionalPlain].filter(Boolean).join("\n\n");
      return {
        title: j.text,
        company: m.slug,
        location: j.categories?.location ?? "",
        description,
        url: j.hostedUrl ?? j.applyUrl ?? "",
        postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : null,
        employmentType: j.categories?.commitment ?? null,
      };
    }
    case "ashby": {
      const board = (await getJson(
        `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(m.slug)}`,
        signal,
      )) as { jobs?: Array<{ id?: string; title?: string; location?: string; descriptionPlain?: string; descriptionHtml?: string; jobUrl?: string; applyUrl?: string; publishedAt?: string; employmentType?: string }> } | null;
      const j = board?.jobs?.find((x) => x.id === m.jobId);
      if (!j?.title) return null;
      return {
        title: j.title,
        company: m.slug,
        location: j.location ?? "",
        description: j.descriptionPlain || htmlToText(j.descriptionHtml ?? ""),
        url: j.jobUrl ?? j.applyUrl ?? "",
        postedAt: j.publishedAt ?? null,
        employmentType: j.employmentType ?? null,
      };
    }
    case "workable": {
      const acc = (await getJson(
        `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(m.slug)}?details=true`,
        signal,
      )) as { name?: string; jobs?: Array<{ shortcode?: string; title?: string; city?: string; country?: string; description?: string; requirements?: string; url?: string; application_url?: string; created_at?: string; employment_type?: string }> } | null;
      const j = acc?.jobs?.find((x) => x.shortcode === m.jobId);
      if (!j?.title) return null;
      const description = htmlToText([j.description, j.requirements].filter(Boolean).join("\n\n"));
      return {
        title: j.title,
        company: acc?.name ?? m.slug,
        location: [j.city, j.country].filter(Boolean).join(", "),
        description,
        url: j.url ?? j.application_url ?? "",
        postedAt: j.created_at ?? null,
        employmentType: j.employment_type ?? null,
      };
    }
    case "smartrecruiters": {
      const j = (await getJson(
        `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(m.slug)}/postings/${encodeURIComponent(m.jobId)}`,
        signal,
      )) as {
        name?: string;
        releasedDate?: string;
        company?: { name?: string; identifier?: string };
        location?: { city?: string; region?: string; country?: string };
        typeOfEmployment?: { label?: string };
        jobAd?: { sections?: Record<string, { text?: string }> };
      } | null;
      if (!j?.name) return null;
      const sections = j.jobAd?.sections ?? {};
      const description = ["companyDescription", "jobDescription", "qualifications", "additionalInformation"]
        .map((k) => sections[k]?.text)
        .filter((t): t is string => !!t)
        .map((t) => htmlToText(t))
        .join("\n\n");
      return {
        title: j.name,
        company: j.company?.name ?? m.slug,
        location: [j.location?.city, j.location?.region, j.location?.country].filter(Boolean).join(", "),
        description,
        url: `https://jobs.smartrecruiters.com/${encodeURIComponent(j.company?.identifier ?? m.slug)}/${encodeURIComponent(m.jobId)}`,
        postedAt: j.releasedDate ?? null,
        employmentType: j.typeOfEmployment?.label ?? null,
      };
    }
    default:
      return null;
  }
}
