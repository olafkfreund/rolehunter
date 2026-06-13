import { afterEach, describe, expect, it, vi } from "vitest";

import { createAshbyAdapter } from "./ashby";
import { createSmartRecruitersAdapter } from "./smartrecruiters";
import { createWorkableAdapter } from "./workable";
import { SourcePermanentError } from "./errors";
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

describe("workable adapter", () => {
  it("returns [] when no target companies are set", async () => {
    const out = await createWorkableAdapter().search(params(), signal());
    expect(out).toEqual([]);
  });

  it("parses jobs and applies the query filter", async () => {
    globalThis.fetch = vi.fn(async () =>
      json({
        name: "Acme",
        jobs: [
          {
            shortcode: "ABC123",
            title: "Senior Platform Engineer",
            city: "London",
            country: "United Kingdom",
            telecommuting: true,
            employment_type: "Full-time",
            created_at: "2026-06-01",
            url: "https://apply.workable.com/acme/j/ABC123/",
            description: "<p>Build <b>platforms</b> with Kubernetes</p>",
          },
          {
            shortcode: "XYZ999",
            title: "Marketing Lead",
            url: "https://apply.workable.com/acme/j/XYZ999/",
            description: "<p>Brand work</p>",
          },
        ],
      }),
    ) as unknown as typeof fetch;

    const out = await createWorkableAdapter().search(
      params({ query: "platform", targetCompanies: ["acme"] }),
      signal(),
    );
    expect(out).toHaveLength(1);
    expect(out[0].externalId).toBe("acme-ABC123");
    expect(out[0].title).toBe("Senior Platform Engineer");
    expect(out[0].remoteMode).toBe("remote");
    expect(out[0].location?.raw).toBe("London, United Kingdom");
    expect(out[0].description).not.toContain("<");
  });

  it("skips a 404 company board without throwing", async () => {
    globalThis.fetch = vi.fn(async () => json({ error: "not found" }, 404)) as unknown as typeof fetch;
    const out = await createWorkableAdapter().search(
      params({ targetCompanies: ["missing"] }),
      signal(),
    );
    expect(out).toEqual([]);
  });

  it("throws permanent on 401", async () => {
    globalThis.fetch = vi.fn(async () => json({ error: "unauthorized" }, 401)) as unknown as typeof fetch;
    await expect(
      createWorkableAdapter().search(params({ targetCompanies: ["acme"] }), signal()),
    ).rejects.toBeInstanceOf(SourcePermanentError);
  });
});

describe("ashby adapter", () => {
  it("parses listed jobs, maps workplaceType, and skips unlisted", async () => {
    globalThis.fetch = vi.fn(async () =>
      json({
        jobs: [
          {
            id: "job-1",
            title: "Backend Engineer",
            location: "Berlin, Germany",
            workplaceType: "Hybrid",
            employmentType: "FullTime",
            publishedAt: "2026-05-20",
            jobUrl: "https://jobs.ashbyhq.com/acme/job-1",
            descriptionPlain: "Work on Go services",
            isListed: true,
          },
          {
            id: "job-2",
            title: "Hidden Role",
            jobUrl: "https://jobs.ashbyhq.com/acme/job-2",
            descriptionPlain: "secret",
            isListed: false,
          },
        ],
      }),
    ) as unknown as typeof fetch;

    const out = await createAshbyAdapter().search(
      params({ targetCompanies: ["acme"] }),
      signal(),
    );
    expect(out).toHaveLength(1);
    expect(out[0].externalId).toBe("acme-job-1");
    expect(out[0].remoteMode).toBe("hybrid");
    expect(out[0].jobType).toBe("FullTime");
  });
});

describe("smartrecruiters adapter", () => {
  it("fetches list then detail for the description body", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/postings/")) {
        return json({
          name: "Data Engineer",
          jobAd: {
            sections: {
              jobDescription: { text: "<p>Own the <b>pipeline</b></p>" },
              qualifications: { text: "<p>SQL, Spark</p>" },
            },
          },
        });
      }
      return json({
        totalFound: 1,
        content: [
          {
            id: "12345",
            name: "Data Engineer",
            releasedDate: "2026-06-02",
            company: { identifier: "Acme", name: "Acme Corp" },
            location: { city: "Paris", country: "France", remote: false },
            typeOfEmployment: { label: "Permanent" },
          },
        ],
      });
    }) as unknown as typeof fetch;

    const out = await createSmartRecruitersAdapter().search(
      params({ targetCompanies: ["Acme"] }),
      signal(),
    );
    expect(out).toHaveLength(1);
    expect(out[0].externalId).toBe("Acme-12345");
    expect(out[0].company).toBe("Acme Corp");
    expect(out[0].location?.raw).toBe("Paris, France");
    expect(out[0].description).toContain("pipeline");
    expect(out[0].description).not.toContain("<");
    expect(out[0].url).toBe("https://jobs.smartrecruiters.com/Acme/12345");
  });
});
