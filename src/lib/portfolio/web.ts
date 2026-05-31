// Generic web-page ingester for the portfolio. Reads a URL, extracts title,
// summary, body excerpt, og:image, and best-effort tech keywords from the
// rendered HTML. No headless browser — works only on server-rendered pages.

import { parse } from "node-html-parser";
import type { PortfolioRepoData } from "@/lib/portfolio/github";
import { extractTechTokens } from "@/lib/tech-tokens";

export type WebPortfolioKind = "blog_post" | "website";

interface WebMeta {
  title: string;
  description: string;
  bodyExcerpt: string;
  ogImage: string | null;
  publishedAt: string | null;
  tech: string[];
}

const FETCH_HEADERS: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (compatible; RoleHunterBot/3.1; +https://github.com/olafkfreund/rolehunter)",
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "en-US,en;q=0.9",
};

function fetchWithUserAgent(url: string): Promise<Response> {
  return fetch(url, {
    headers: FETCH_HEADERS,
    cache: "no-store",
    redirect: "follow",
  });
}

function extractMeta(html: string): WebMeta {
  const root = parse(html, {
    lowerCaseTagName: true,
    blockTextElements: { script: false, noscript: false, style: false, pre: true, code: true },
  });

  // Title: <title> or og:title or twitter:title
  const titleEl = root.querySelector("title");
  const ogTitle = root.querySelector('meta[property="og:title"]')?.getAttribute("content");
  const twTitle = root.querySelector('meta[name="twitter:title"]')?.getAttribute("content");
  const title = (ogTitle || twTitle || titleEl?.text || "").trim().slice(0, 500);

  // Description: meta description, og:description, twitter:description
  const metaDesc = root
    .querySelector('meta[name="description"]')
    ?.getAttribute("content");
  const ogDesc = root.querySelector('meta[property="og:description"]')?.getAttribute("content");
  const twDesc = root.querySelector('meta[name="twitter:description"]')?.getAttribute("content");
  const description = (metaDesc || ogDesc || twDesc || "").trim().slice(0, 1_000);

  // Body excerpt: prefer <article>, then <main>, then largest <div>
  const article = root.querySelector("article") || root.querySelector("main") || root.querySelector("body");
  const rawText = article?.text || "";
  const cleaned = rawText.replace(/\s+/g, " ").trim();
  const bodyExcerpt = cleaned.slice(0, 6_000);

  // og:image / twitter:image
  const ogImage =
    root.querySelector('meta[property="og:image"]')?.getAttribute("content") ||
    root.querySelector('meta[name="twitter:image"]')?.getAttribute("content") ||
    null;

  // Published date
  const publishedAt =
    root.querySelector('meta[property="article:published_time"]')?.getAttribute("content") ||
    root.querySelector('meta[name="date"]')?.getAttribute("content") ||
    root.querySelector("time[datetime]")?.getAttribute("datetime") ||
    null;

  // Tech keyword extraction: search title + description + first 4KB of body
  const tech = extractTechTokens(
    `${title}\n${description}\n${bodyExcerpt.slice(0, 4_000)}`,
  );

  return {
    title: title || "(untitled)",
    description,
    bodyExcerpt,
    ogImage,
    publishedAt: publishedAt && !Number.isNaN(new Date(publishedAt).getTime()) ? publishedAt : null,
    tech,
  };
}

export async function fetchWebPortfolio(
  url: string,
  kind: WebPortfolioKind = "blog_post",
): Promise<PortfolioRepoData> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error("Only http and https URLs are supported");
  }

  const res = await fetchWithUserAgent(url);
  if (!res.ok) {
    if (res.status === 403 || res.status === 401) {
      throw new Error(
        `Site rejected the request (${res.status}). Likely bot-protected; paste the content manually instead.`,
      );
    }
    if (res.status === 404) throw new Error(`404 — page not found at ${url}`);
    throw new Error(`Fetch failed: HTTP ${res.status}`);
  }

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
    throw new Error(`Expected HTML, got ${contentType || "unknown"} — only web pages are supported`);
  }

  const html = await res.text();
  if (html.length < 200) throw new Error("Page is suspiciously short; likely a redirect or JS-only render");
  if (html.length > 2_500_000) throw new Error("Page is too large (> 2.5 MB)");

  const meta = extractMeta(html);

  const description = [meta.description, meta.bodyExcerpt]
    .filter((s) => s && s.trim().length > 0)
    .join("\n\n")
    .slice(0, 8_000);

  // External ID: a stable hash-ish key derived from the URL so re-imports
  // update rather than duplicate. Just use the URL itself, normalised.
  const externalId = parsedUrl.href.replace(/#.*$/, "").replace(/\?.*$/, "");

  return {
    externalId,
    title: meta.title,
    description,
    url: parsedUrl.href,
    tech: meta.tech,
    highlights: [],
    stars: 0,
    startedAt: meta.publishedAt ?? new Date().toISOString(),
    endedAt: null,
    rawJson: {
      kind,
      ogImage: meta.ogImage,
      publishedAt: meta.publishedAt,
      host: parsedUrl.host,
    },
  };
}
