import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyNewsKind,
  fetchCompanyNews,
  parseRssItems,
} from "./news-rss";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("news-rss.classifyNewsKind", () => {
  it("recognises funding rounds", () => {
    expect(classifyNewsKind("Acme raises $50M Series C")).toBe("funding");
    expect(classifyNewsKind("BetaCo Raised Seed Round")).toBe("funding");
  });
  it("recognises acquisitions", () => {
    expect(classifyNewsKind("BigCorp acquires Acme")).toBe("acquisition");
    expect(classifyNewsKind("Acme acquisition closes")).toBe("acquisition");
  });
  it("recognises IPOs", () => {
    expect(classifyNewsKind("Acme files for IPO")).toBe("ipo");
  });
  it("recognises leadership news", () => {
    expect(classifyNewsKind("Acme hires new CTO")).toBe("leadership");
  });
  it("falls back to 'news' for everything else", () => {
    expect(classifyNewsKind("Acme launches new product line")).toBe("news");
  });
});

describe("news-rss.parseRssItems", () => {
  it("parses a Google-News-shape RSS feed", () => {
    const xml = `<?xml version="1.0"?>
<rss>
  <channel>
    <item>
      <title><![CDATA[Stripe raises $694M Series I]]></title>
      <link>https://news.example.com/a</link>
      <pubDate>Mon, 20 May 2026 09:30:00 GMT</pubDate>
      <description><![CDATA[<a href="x">Reuters</a>: Stripe announced...]]></description>
    </item>
    <item>
      <title>Untitled item without CDATA</title>
      <link>https://news.example.com/b</link>
      <pubDate>Mon, 21 May 2026 12:00:00 GMT</pubDate>
      <description>plain description</description>
    </item>
  </channel>
</rss>`;
    const items = parseRssItems(xml);
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe("Stripe raises $694M Series I");
    expect(items[0].url).toBe("https://news.example.com/a");
    expect(items[0].publishedAt).toBe("2026-05-20T09:30:00.000Z");
    expect(items[0].summary).toContain("Stripe announced");
    expect(items[1].title).toBe("Untitled item without CDATA");
  });

  it("returns [] on malformed XML", () => {
    expect(parseRssItems("not xml")).toEqual([]);
  });
});

describe("news-rss.fetchCompanyNews", () => {
  it("returns [] for empty company name", async () => {
    expect(await fetchCompanyNews("")).toEqual([]);
    expect(await fetchCompanyNews("   ")).toEqual([]);
  });

  it("returns [] when fetch fails", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    const out = await fetchCompanyNews("Stripe");
    expect(out).toEqual([]);
  });

  it("returns [] on non-OK response", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response("nope", { status: 500 }),
    ) as unknown as typeof fetch;
    const out = await fetchCompanyNews("Stripe");
    expect(out).toEqual([]);
  });

  it("maps parsed items into NewNewsItem shape with detected kind", async () => {
    const xml = `<rss><channel>
      <item>
        <title>Acme raises Series B</title>
        <link>https://x.test/1</link>
        <pubDate>Mon, 20 May 2026 09:30:00 GMT</pubDate>
        <description>announcement</description>
      </item>
    </channel></rss>`;
    globalThis.fetch = vi.fn(async () =>
      new Response(xml, { status: 200 }),
    ) as unknown as typeof fetch;
    const out = await fetchCompanyNews("Acme");
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("funding");
    expect(out[0].source).toBe("google-news-rss");
    expect(out[0].url).toBe("https://x.test/1");
  });
});
