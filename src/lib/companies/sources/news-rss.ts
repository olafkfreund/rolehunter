// Google News RSS adapter — free, no API key required.
// https://news.google.com/rss/search?q=...&hl=en-US&gl=US&ceid=US:en
//
// We don't depend on a third-party RSS parser; the format is stable and
// the elements we care about (item.title, item.link, item.pubDate,
// item.description) come out cleanly with a single regex.
//
// Item kind is heuristic: titles mentioning "raises", "funding", "Series X",
// "acquires", "IPO", "lays off" get the appropriate company_news_kind.

import type { NewNewsItem } from "@/lib/repo/company-siblings";

const RSS_ITEM_RX = /<item[^>]*>([\s\S]*?)<\/item>/g;
const TAG_RX = (tag: string) =>
  new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, "i");

function stripHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/<[^>]+>/g, "")
    .trim();
}

export function classifyNewsKind(title: string): NewNewsItem["kind"] {
  const lower = title.toLowerCase();
  if (/\b(series [a-h]|raises?|raised|funding round|seed round)\b/.test(lower)) {
    return "funding";
  }
  if (/\b(acquire[ds]?|acquisition|to buy|merger)\b/.test(lower)) {
    return "acquisition";
  }
  if (/\b(files? for ipo|going public|ipo at)\b/.test(lower)) return "ipo";
  if (/\b(ceo|cto|cfo|hires|appoint(s|ed))\b/.test(lower)) return "leadership";
  return "news";
}

export interface RssItem {
  title: string;
  url: string | null;
  summary: string;
  publishedAt: string | null;
}

export function parseRssItems(xml: string): RssItem[] {
  const items: RssItem[] = [];
  for (const match of xml.matchAll(RSS_ITEM_RX)) {
    const block = match[1];
    const titleM = block.match(TAG_RX("title"));
    const linkM = block.match(TAG_RX("link"));
    const dateM = block.match(TAG_RX("pubDate"));
    const descM = block.match(TAG_RX("description"));
    const title = stripHtml(titleM?.[1] ?? "");
    if (!title) continue;
    const url = (linkM?.[1] ?? "").trim() || null;
    const publishedAt =
      dateM?.[1] && !Number.isNaN(new Date(dateM[1]).getTime())
        ? new Date(dateM[1]).toISOString()
        : null;
    const summary = stripHtml(descM?.[1] ?? "").slice(0, 2_000);
    items.push({ title, url, summary, publishedAt });
  }
  return items;
}

export interface FetchNewsOptions {
  limit?: number;
}

/**
 * Fetch recent news items for a company by name. Returns up to `limit` items
 * (default 10) suitable for upsertNewsItem(). Returns [] on any fetch error
 * so the orchestrator can swallow it silently.
 */
export async function fetchCompanyNews(
  companyName: string,
  opts: FetchNewsOptions = {},
): Promise<NewNewsItem[]> {
  const limit = opts.limit ?? 10;
  const q = companyName.trim();
  if (!q) return [];
  // Wrap in quotes so we get the company as a phrase rather than each word.
  const query = `"${q}"`;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  let xml: string;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "rolehunter/3.2 (+https://github.com/olafkfreund/rolehunter; olaf@freundcloud.com)",
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
      cache: "no-store",
    });
    if (!res.ok) return [];
    xml = await res.text();
  } catch {
    return [];
  }

  const raw = parseRssItems(xml).slice(0, limit);
  return raw.map((r) => ({
    title: r.title,
    summary: r.summary,
    url: r.url,
    source: "google-news-rss",
    publishedAt: r.publishedAt,
    kind: classifyNewsKind(r.title),
  }));
}
