// Pasted-URL job import. Three-tier extraction:
//   Tier 1: schema.org JobPosting JSON-LD (most modern career sites embed it)
//   Tier 2: Open Graph + meta tags
//   Tier 3: Heuristic title-then-body
//
// LinkedIn job pages are JS-rendered AND bot-protected, so raw HTTP fetch can't
// extract them. We detect that host explicitly and return a friendly error
// telling the user to use the linkedin-jobs adapter or paste the role text
// manually via /jobs/search-paste.

import { parse } from "node-html-parser";

export interface ImportedJob {
  title: string;
  company: string;
  location: string;
  description: string;
  url: string;
  postedAt: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  employmentType: string | null;
  source: "url-import";
  extractionMethod: "json-ld" | "og-meta" | "heuristic";
}

const FETCH_HEADERS: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (compatible; RoleHunterBot/3.1; +https://github.com/olafkfreund/rolehunter)",
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "en-US,en;q=0.9",
};

interface JsonLdJobPosting {
  "@type"?: string | string[];
  title?: string;
  description?: string;
  datePosted?: string;
  validThrough?: string;
  employmentType?: string | string[];
  hiringOrganization?: { name?: string; sameAs?: string } | string;
  jobLocation?:
    | {
        "@type"?: string;
        address?: {
          addressLocality?: string;
          addressRegion?: string;
          addressCountry?: string | { name?: string };
        };
      }
    | Array<{
        address?: {
          addressLocality?: string;
          addressRegion?: string;
          addressCountry?: string | { name?: string };
        };
      }>;
  baseSalary?: {
    currency?: string;
    value?: {
      minValue?: number | string;
      maxValue?: number | string;
      value?: number | string;
    };
  };
}

function isJobPosting(node: unknown): node is JsonLdJobPosting {
  if (!node || typeof node !== "object") return false;
  const t = (node as { "@type"?: unknown })["@type"];
  if (typeof t === "string") return t === "JobPosting";
  if (Array.isArray(t)) return t.includes("JobPosting");
  return false;
}

function extractJsonLdJobs(html: string): JsonLdJobPosting | null {
  const root = parse(html);
  const scripts = root.querySelectorAll('script[type="application/ld+json"]');
  for (const s of scripts) {
    const raw = s.text.trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as unknown;
      const candidates: unknown[] = [];
      // JSON-LD can be a single object, an array, or have a @graph property.
      if (Array.isArray(parsed)) candidates.push(...parsed);
      else if (parsed && typeof parsed === "object") {
        candidates.push(parsed);
        const graph = (parsed as { "@graph"?: unknown[] })["@graph"];
        if (Array.isArray(graph)) candidates.push(...graph);
      }
      for (const c of candidates) {
        if (isJobPosting(c)) return c;
      }
    } catch {
      // Some sites embed almost-JSON; skip and keep looking.
    }
  }
  return null;
}

function stripHtml(s: string): string {
  return s
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])\s*>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function locationFromJsonLd(loc: JsonLdJobPosting["jobLocation"]): string {
  if (!loc) return "";
  const first = Array.isArray(loc) ? loc[0] : loc;
  if (!first || !first.address) return "";
  const a = first.address;
  const country =
    typeof a.addressCountry === "string"
      ? a.addressCountry
      : a.addressCountry?.name ?? "";
  return [a.addressLocality, a.addressRegion, country]
    .filter((s) => s && s.length > 0)
    .join(", ");
}

function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function fromJsonLd(j: JsonLdJobPosting, url: string): ImportedJob {
  const company =
    typeof j.hiringOrganization === "string"
      ? j.hiringOrganization
      : j.hiringOrganization?.name ?? "";
  const employmentType = Array.isArray(j.employmentType)
    ? j.employmentType.join(", ")
    : j.employmentType ?? null;
  const salaryMin = num(j.baseSalary?.value?.minValue);
  const salaryMax = num(j.baseSalary?.value?.maxValue);
  const fallback = num(j.baseSalary?.value?.value);
  return {
    title: j.title?.trim() || "(untitled)",
    company,
    location: locationFromJsonLd(j.jobLocation),
    description: stripHtml(j.description ?? "").slice(0, 30_000),
    url,
    postedAt:
      j.datePosted && !Number.isNaN(new Date(j.datePosted).getTime())
        ? j.datePosted
        : null,
    salaryMin: salaryMin ?? fallback,
    salaryMax: salaryMax ?? null,
    salaryCurrency: j.baseSalary?.currency ?? null,
    employmentType,
    source: "url-import",
    extractionMethod: "json-ld",
  };
}

function fromMetaAndHeuristics(html: string, url: string): ImportedJob {
  const root = parse(html);

  // Prune non-content and noise elements from the DOM
  root.querySelectorAll("script, style, noscript, iframe, svg, form, nav, footer, header").forEach((el) => el.remove());

  const title =
    root.querySelector('meta[property="og:title"]')?.getAttribute("content") ||
    root.querySelector('meta[name="twitter:title"]')?.getAttribute("content") ||
    root.querySelector("h1")?.text ||
    root.querySelector("title")?.text ||
    "(untitled)";

  const company =
    root.querySelector('meta[property="og:site_name"]')?.getAttribute("content") ||
    root.querySelector('meta[name="application-name"]')?.getAttribute("content") ||
    "";

  const description =
    root.querySelector('meta[name="description"]')?.getAttribute("content") ||
    root.querySelector('meta[property="og:description"]')?.getAttribute("content") ||
    "";

  // Body excerpt for description body
  const article =
    root.querySelector("article") ||
    root.querySelector("main") ||
    root.querySelector('[class*="job-description" i]') ||
    root.querySelector('[class*="description" i]') ||
    root.querySelector("body");

  const innerHtml = article?.innerHTML || "";
  const body = stripHtml(innerHtml);
  const fullDesc = [description, body]
    .filter((s) => s && s.trim().length > 0)
    .join("\n\n")
    .slice(0, 30_000);

  return {
    title: title.trim().slice(0, 500),
    company: company.trim().slice(0, 200),
    location: "",
    description: fullDesc,
    url,
    postedAt: null,
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    employmentType: null,
    source: "url-import",
    extractionMethod: "og-meta",
  };
}

const BLOCKED_HOSTS = new Set([
  "www.linkedin.com",
  "linkedin.com",
  "uk.linkedin.com",
  "de.linkedin.com",
  "fr.linkedin.com",
]);

const BLOCKED_HOST_MESSAGE = (host: string) =>
  `${host} is JS-rendered and bot-protected. Use the linkedin-jobs adapter in /search (it has a Search-API key), or paste the role text via /jobs/search-paste.`;

export async function importJobFromUrl(rawUrl: string): Promise<ImportedJob> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http and https URLs are supported");
  }
  if (BLOCKED_HOSTS.has(parsed.host)) {
    throw new Error(BLOCKED_HOST_MESSAGE(parsed.host));
  }

  const res = await fetch(parsed.href, {
    headers: FETCH_HEADERS,
    cache: "no-store",
    redirect: "follow",
  });
  if (!res.ok) {
    if (res.status === 403 || res.status === 401) {
      throw new Error(
        `Site rejected the request (${res.status}). Likely bot-protected; paste the role text via /jobs/search-paste instead.`,
      );
    }
    if (res.status === 404) throw new Error(`404 — page not found at ${rawUrl}`);
    throw new Error(`Fetch failed: HTTP ${res.status}`);
  }
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
    throw new Error(`Expected HTML, got ${contentType || "unknown"}`);
  }
  const html = await res.text();
  if (html.length < 200) {
    throw new Error("Page is suspiciously short; likely a JS-only render. Paste manually.");
  }
  if (html.length > 4_000_000) {
    throw new Error("Page too large (> 4 MB)");
  }

  const jsonLd = extractJsonLdJobs(html);
  if (jsonLd) {
    return fromJsonLd(jsonLd, parsed.href);
  }
  return fromMetaAndHeuristics(html, parsed.href);
}
