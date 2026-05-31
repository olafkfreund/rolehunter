import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeFitReport } from "./fit-score";
import { _resetFxCache } from "@/lib/fx";
import type { Company, JobListing, Profile } from "@/lib/db/schema";
import type { CvJson } from "@/lib/llm";

function mkJob(overrides: Partial<JobListing> = {}): JobListing {
  return {
    id: 1,
    source: "paste",
    externalId: "ext-1",
    title: "Senior Platform Engineer",
    company: "Acme",
    location: "London, UK",
    url: null,
    description:
      "We use Kubernetes, Terraform, and AWS. Hybrid setup. Strong ownership expected.",
    postedAt: new Date(),
    salaryMin: 110_000,
    salaryMax: 140_000,
    salaryCurrency: "USD",
    rawJson: null,
    cachedAt: new Date(),
    dedupeHash: null,
    sourcesSeen: [],
    fetchedAt: new Date(),
    topScore: null,
    searchProfileId: null,
    companyId: null,
    ...overrides,
  } as unknown as JobListing;
}

function mkCv(overrides: Partial<CvJson> = {}): CvJson {
  return {
    fullName: "Jane Doe",
    skills: ["Kubernetes", "Terraform", "AWS", "Python"],
    experience: [
      { company: "Past", title: "Engineer", start: "2014-01", end: "", bullets: [] },
    ],
    ...overrides,
  };
}

function mkProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 1,
    fullName: "Jane Doe",
    email: "jane@example.com",
    phone: "",
    location: "London, UK",
    summary: "",
    avatarPath: null,
    linkedinUrl: null,
    linkedinHeadline: null,
    linkedinAbout: null,
    homeAddress: null,
    homeLat: null,
    homeLng: null,
    homeGeocodedAt: null,
    salaryTargetMin: null,
    salaryTargetMax: null,
    salaryTargetCurrency: null,
    salaryTargetPeriod: null,
    workModePreference: null,
    maxOfficeDaysPerWeek: null,
    cultureLikes: [],
    cultureAvoids: [],
    updatedAt: new Date(),
    ...overrides,
  } as unknown as Profile;
}

describe("fit-score.computeFitReport", () => {
  beforeEach(() => {
    _resetFxCache();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("scores 100 on skills when every JD token is in the CV", async () => {
    const r = await computeFitReport(
      mkJob({ description: "Kubernetes, Terraform, AWS." }),
      mkCv({ skills: ["Kubernetes", "Terraform", "AWS"] }),
      null,
      mkProfile(),
    );
    const skills = r.dimensions.find((d) => d.key === "skills")!;
    expect(skills.score).toBe(100);
    expect(skills.band).toBe("top");
  });

  it("scores 0 on skills when nothing in the JD matches the CV", async () => {
    const r = await computeFitReport(
      mkJob({ description: "Rust, Elixir, Haskell." }),
      mkCv({ skills: ["Python"] }),
      null,
      mkProfile(),
    );
    const skills = r.dimensions.find((d) => d.key === "skills")!;
    expect(skills.score).toBeLessThan(50);
    expect(skills.band).toBe("pass");
  });

  it("flags experience as 'pass' when CV YOE is far below JD seniority", async () => {
    const r = await computeFitReport(
      mkJob({ title: "Staff Engineer" }),
      mkCv({
        skills: ["Python"],
        experience: [
          { company: "X", title: "Eng", start: "2025-01", end: "", bullets: [] },
        ],
      }),
      null,
      mkProfile(),
    );
    const exp = r.dimensions.find((d) => d.key === "experience")!;
    expect(exp.score).toBeLessThan(70);
  });

  it("Compensation: n/a when no target band set", async () => {
    const r = await computeFitReport(
      mkJob({ salaryMin: 100_000, salaryMax: 150_000, salaryCurrency: "USD" }),
      mkCv(),
      null,
      mkProfile(),
    );
    const comp = r.dimensions.find((d) => d.key === "comp")!;
    expect(comp.score).toBe(-1);
    expect(comp.band).toBe("n/a");
  });

  it("Compensation: 100 when JD floor meets target floor (same currency)", async () => {
    const r = await computeFitReport(
      mkJob({ salaryMin: 120_000, salaryMax: 180_000, salaryCurrency: "USD" }),
      mkCv(),
      null,
      mkProfile({
        salaryTargetMin: 100_000,
        salaryTargetMax: 140_000,
        salaryTargetCurrency: "USD",
        salaryTargetPeriod: "annual",
      }),
    );
    const comp = r.dimensions.find((d) => d.key === "comp")!;
    expect(comp.score).toBe(100);
  });

  it("Compensation: converts via FX when currencies differ", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          amount: 1,
          base: "USD",
          date: "2026-05-31",
          rates: { GBP: 0.8, EUR: 0.92 },
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;
    const r = await computeFitReport(
      // USD 150-180K → GBP 120-144K at rate 0.8
      mkJob({ salaryMin: 150_000, salaryMax: 180_000, salaryCurrency: "USD" }),
      mkCv(),
      null,
      mkProfile({
        salaryTargetMin: 100_000,
        salaryTargetMax: 130_000,
        salaryTargetCurrency: "GBP",
        salaryTargetPeriod: "annual",
      }),
    );
    const comp = r.dimensions.find((d) => d.key === "comp")!;
    expect(comp.score).toBe(100); // GBP-converted floor 120K ≥ target floor 100K
    expect(comp.evidence.some((e) => e.includes("FX-converted"))).toBe(true);
  });

  it("Compensation: n/a when FX lookup fails on a currency mismatch", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    const r = await computeFitReport(
      mkJob({ salaryMin: 100_000, salaryMax: 150_000, salaryCurrency: "USD" }),
      mkCv(),
      null,
      mkProfile({
        salaryTargetMin: 80_000,
        salaryTargetMax: 110_000,
        salaryTargetCurrency: "GBP",
        salaryTargetPeriod: "annual",
      }),
    );
    const comp = r.dimensions.find((d) => d.key === "comp")!;
    expect(comp.score).toBe(-1);
    expect(comp.band).toBe("n/a");
  });

  it("Culture: penalty for triggered avoids when prefs are set", async () => {
    const r = await computeFitReport(
      mkJob({
        description: "We're an in-office fast-paced team.",
        location: "London",
      }),
      mkCv(),
      null,
      mkProfile({
        cultureLikes: ["async"] as never,
        cultureAvoids: ["in-office", "fast-paced"] as never,
        workModePreference: "remote",
      }),
    );
    const culture = r.dimensions.find((d) => d.key === "culture")!;
    expect(culture.score).toBeLessThan(60);
    expect(culture.evidence.some((e) => e.includes("triggers avoids"))).toBe(true);
  });

  it("overall is the weighted average of scored dimensions", async () => {
    const r = await computeFitReport(
      mkJob({
        description: "Kubernetes, Terraform, AWS. Hybrid setup.",
        salaryMin: 0,
        salaryMax: 0,
        salaryCurrency: null,
      }),
      mkCv({ skills: ["Kubernetes", "Terraform", "AWS"] }),
      null,
      mkProfile(),
    );
    expect(r.overall.score).toBeGreaterThanOrEqual(0);
    expect(r.overall.score).toBeLessThanOrEqual(100);
  });
});
