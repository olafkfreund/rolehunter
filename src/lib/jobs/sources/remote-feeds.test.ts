import { afterEach, describe, expect, it, vi } from "vitest";

import { createHimalayasAdapter } from "./himalayas";
import { createJobicyAdapter } from "./jobicy";
import { createRemoteOkAdapter } from "./remoteok";
import { createRemotiveAdapter } from "./remotive";
import type { SearchParams } from "./types";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const signal = () => new AbortController().signal;
function params(overrides: Partial<SearchParams> = {}): SearchParams {
  return { query: "", maxResults: 50, ...overrides };
}
function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("remotive adapter", () => {
  it("parses jobs, marks remote, strips HTML", async () => {
    globalThis.fetch = vi.fn(async () =>
      json({
        jobs: [
          {
            id: 101,
            url: "https://remotive.com/jobs/101",
            title: "Senior DevOps Engineer",
            company_name: "Acme",
            job_type: "full_time",
            publication_date: "2026-06-10",
            candidate_required_location: "Europe",
            description: "<p>Run <b>Terraform</b></p>",
          },
        ],
      }),
    ) as unknown as typeof fetch;
    const out = await createRemotiveAdapter().search(params({ query: "devops" }), signal());
    expect(out).toHaveLength(1);
    expect(out[0].externalId).toBe("101");
    expect(out[0].remoteMode).toBe("remote");
    expect(out[0].description).toBe("Run Terraform");
  });
});

describe("jobicy adapter", () => {
  it("maps jobTitle/jobGeo and applies the query filter", async () => {
    globalThis.fetch = vi.fn(async () =>
      json({
        jobs: [
          {
            id: 7,
            url: "https://jobicy.com/jobs/7",
            jobTitle: "Platform Engineer",
            companyName: "Globex",
            jobGeo: "Anywhere",
            jobLevel: "Senior",
            jobDescription: "<p>Kubernetes platform</p>",
            pubDate: "2026-06-09",
          },
          {
            id: 8,
            url: "https://jobicy.com/jobs/8",
            jobTitle: "Designer",
            companyName: "Globex",
            jobDescription: "<p>Figma</p>",
          },
        ],
      }),
    ) as unknown as typeof fetch;
    const out = await createJobicyAdapter().search(params({ query: "platform" }), signal());
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("Platform Engineer");
    expect(out[0].experienceLevel).toBe("Senior");
  });
});

describe("remoteok adapter", () => {
  it("skips the leading metadata element and parses jobs + salary", async () => {
    globalThis.fetch = vi.fn(async () =>
      json([
        { legal: "RemoteOK API legal notice", id: "0" }, // metadata, no `position`
        {
          id: "55",
          position: "Backend Engineer",
          company: "Initech",
          location: "Worldwide",
          description: "<p>Go services</p>",
          url: "https://remoteok.com/jobs/55",
          salary_min: 90000,
          salary_max: 130000,
          date: "2026-06-08",
        },
      ]),
    ) as unknown as typeof fetch;
    const out = await createRemoteOkAdapter().search(params(), signal());
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("Backend Engineer");
    expect(out[0].salary).toEqual({ min: 90000, max: 130000, currency: "USD", period: "year" });
  });
});

describe("himalayas adapter", () => {
  it("uses guid as id and maps salary + location restrictions", async () => {
    globalThis.fetch = vi.fn(async () =>
      json({
        jobs: [
          {
            guid: "job-abc",
            title: "SRE",
            companyName: "Hooli",
            employmentType: "Full Time",
            minSalary: 100000,
            maxSalary: 150000,
            currency: "EUR",
            salaryPeriod: "year",
            locationRestrictions: ["Germany", "Netherlands"],
            description: "<p>On-call rotations</p>",
            pubDate: "2026-06-07",
            applicationLink: "https://himalayas.app/jobs/job-abc",
          },
        ],
      }),
    ) as unknown as typeof fetch;
    const out = await createHimalayasAdapter().search(params(), signal());
    expect(out).toHaveLength(1);
    expect(out[0].externalId).toBe("job-abc");
    expect(out[0].location?.raw).toBe("Germany, Netherlands");
    expect(out[0].salary).toEqual({ min: 100000, max: 150000, currency: "EUR", period: "year" });
  });
});
