import { afterEach, describe, expect, it, vi } from "vitest";

import { createArbeitnowAdapter } from "./arbeitnow";
import { createBundesagenturAdapter } from "./bundesagentur";
import type { SearchParams } from "./types";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const signal = () => new AbortController().signal;
function params(overrides: Partial<SearchParams> = {}): SearchParams {
  return { query: "", maxResults: 50, ...overrides };
}
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("arbeitnow adapter", () => {
  it("parses the feed, strips HTML, and applies the query filter", async () => {
    globalThis.fetch = vi.fn(async () =>
      json({
        data: [
          {
            slug: "devops-engineer-acme",
            company_name: "Acme",
            title: "DevOps Engineer",
            description: "<p>Run <b>Kubernetes</b> clusters</p>",
            remote: true,
            url: "https://www.arbeitnow.com/jobs/devops-engineer-acme",
            job_types: ["full_time"],
            location: "Berlin",
            created_at: 1_700_000_000,
          },
          {
            slug: "sales-rep-acme",
            company_name: "Acme",
            title: "Sales Representative",
            description: "<p>Sell things</p>",
            remote: false,
            url: "https://www.arbeitnow.com/jobs/sales-rep-acme",
            location: "Munich",
          },
        ],
        links: { next: null },
      }),
    ) as unknown as typeof fetch;

    const out = await createArbeitnowAdapter().search(params({ query: "kubernetes" }), signal());
    expect(out).toHaveLength(1);
    expect(out[0].externalId).toBe("devops-engineer-acme");
    expect(out[0].remoteMode).toBe("remote");
    expect(out[0].description).not.toContain("<");
    expect(out[0].postedAt).toBe(new Date(1_700_000_000 * 1000).toISOString());
  });

  it("stops paging once maxResults is reached", async () => {
    const fetchMock = vi.fn(async () =>
      json({
        data: [
          { slug: "a", company_name: "X", title: "Engineer A", url: "https://x/a" },
          { slug: "b", company_name: "X", title: "Engineer B", url: "https://x/b" },
        ],
        links: { next: "https://www.arbeitnow.com/api/job-board-api?page=2" },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const out = await createArbeitnowAdapter().search(params({ maxResults: 1 }), signal());
    expect(out).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1); // didn't fetch page 2
  });
});

describe("bundesagentur adapter", () => {
  it("fetches list then per-job detail for the description and remote flag", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/jobdetails/")) {
        return json({
          stellenangebotsBeschreibung: "<p>Betreue <b>Cloud</b>-Infrastruktur</p>",
          homeofficemoeglich: true,
        });
      }
      return json({
        stellenangebote: [
          {
            beruf: "DevOps Engineer",
            titel: "DevOps Engineer (m/w/d)",
            refnr: "13635-727e145c_JB5167353-S",
            arbeitgeber: "Beispiel GmbH",
            arbeitsort: { ort: "Berlin", region: "Berlin", land: "Deutschland" },
            aktuelleVeroeffentlichungsdatum: "2026-06-10",
          },
        ],
      });
    }) as unknown as typeof fetch;

    const out = await createBundesagenturAdapter().search(
      params({ query: "devops", location: "Berlin" }),
      signal(),
    );
    expect(out).toHaveLength(1);
    expect(out[0].externalId).toBe("13635-727e145c_JB5167353-S");
    expect(out[0].company).toBe("Beispiel GmbH");
    expect(out[0].location?.raw).toBe("Berlin, Deutschland");
    expect(out[0].remoteMode).toBe("hybrid");
    expect(out[0].description).toContain("Cloud");
    expect(out[0].description).not.toContain("<");
    expect(out[0].url).toContain("arbeitsagentur.de/jobsuche/jobdetail/");
  });
});
