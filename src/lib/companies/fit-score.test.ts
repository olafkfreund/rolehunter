import { describe, expect, it } from "vitest";
import { computeCompanyFitScore } from "./fit-score";
import type {
  Company,
  CompanyBenefit,
  CompanyLayoff,
  Profile,
} from "@/lib/db/schema";

function mkCompany(p: Partial<Company> = {}): Company {
  return {
    id: 1,
    name: "Acme",
    slug: "acme",
    website: null,
    headquarters: null,
    hqLat: null,
    hqLng: null,
    hqGeocodedAt: null,
    foundedYear: null,
    summary: "",
    logoUrl: null,
    wikidataId: null,
    linkedinUrl: null,
    glassdoorUrl: null,
    glassdoorRating: null,
    glassdoorReviewCount: null,
    glassdoorRecommendPct: null,
    glassdoorCeoApprovalPct: null,
    glassdoorTopPro: null,
    glassdoorTopCon: null,
    glassdoorSyncedAt: null,
    hasRecentLayoff: false,
    lastLayoffAt: null,
    lastLayoffCount: null,
    enrichmentSyncedAt: null,
    rawJson: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...p,
  } as unknown as Company;
}

function mkProfile(p: Partial<Profile> = {}): Profile {
  return {
    id: 1,
    fullName: "Test",
    email: "",
    phone: "",
    location: "",
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
    maxCommuteMinutes: null,
    preferredTransportMode: null,
    benefitPriorities: [],
    updatedAt: new Date(),
    ...p,
  } as unknown as Profile;
}

describe("computeCompanyFitScore", () => {
  it("returns just the 'no layoff' factor when there are no other signals", () => {
    const r = computeCompanyFitScore({
      company: mkCompany(),
      profile: mkProfile(),
      layoffs: [],
      benefits: [],
    });
    expect(r.factors).toHaveLength(1);
    expect(r.factors[0].key).toBe("layoff");
    expect(r.factors[0].contribution).toBe(100);
    expect(r.score).toBe(100);
  });

  it("scores a 4.5/5 Glassdoor rating in the top band", () => {
    const r = computeCompanyFitScore({
      company: mkCompany({ glassdoorRating: "4.5" as never }),
      profile: mkProfile(),
      layoffs: [],
      benefits: [],
    });
    const rating = r.factors.find((f) => f.key === "glassdoor-rating");
    expect(rating).toBeDefined();
    expect(rating!.contribution).toBe(90); // 4.5 / 5 = 0.9 → 90
    // Weighted with the default "no layoff" 100×1: (90×2 + 100×1) / 3 = 93
    expect(r.score).toBe(93);
  });

  it("penalises a recent layoff hard", () => {
    const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    const r = computeCompanyFitScore({
      company: mkCompany({
        glassdoorRating: "5.0" as never,
        hasRecentLayoff: true,
        lastLayoffAt: fortyDaysAgo,
      }),
      profile: mkProfile(),
      layoffs: [],
      benefits: [],
    });
    const lay = r.factors.find((f) => f.key === "layoff");
    expect(lay).toBeDefined();
    expect(lay!.contribution).toBe(0);
    // weighted: rating 100×2 + layoff 0×2 = 200/4 = 50
    expect(r.score).toBe(50);
  });

  it("rewards a layoff that's old", () => {
    const threeYearsAgo = new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000);
    const r = computeCompanyFitScore({
      company: mkCompany({
        hasRecentLayoff: false,
        lastLayoffAt: threeYearsAgo,
      }),
      profile: mkProfile(),
      layoffs: [
        {
          id: 1,
          companyId: 1,
          affectedCount: 100,
          percentOfWorkforce: null,
          announcedAt: threeYearsAgo,
          sourceUrl: null,
          summary: "",
          rawJson: null,
          fetchedAt: new Date(),
        } as unknown as CompanyLayoff,
      ],
      benefits: [],
    });
    const lay = r.factors.find((f) => f.key === "layoff");
    expect(lay!.contribution).toBe(80);
  });

  it("includes a commute factor when home + HQ are both known", () => {
    const r = computeCompanyFitScore({
      company: mkCompany({ hqLat: 51.55, hqLng: -0.16 }),
      profile: mkProfile({ homeLat: 51.52, homeLng: -0.16 }),
      layoffs: [],
      benefits: [],
    });
    const c = r.factors.find((f) => f.key === "commute");
    expect(c).toBeDefined();
    expect(c!.contribution).toBeGreaterThanOrEqual(85);
  });

  it("scores benefits coverage by ordered priority weight", () => {
    const r = computeCompanyFitScore({
      company: mkCompany(),
      profile: mkProfile({
        benefitPriorities: ["401k", "pto", "parental"] as never,
      }),
      layoffs: [],
      benefits: [
        {
          id: 1,
          companyId: 1,
          category: "401k",
          description: "5% match",
          valueText: null,
          source: null,
          rawJson: null,
          fetchedAt: new Date(),
        } as unknown as CompanyBenefit,
        {
          id: 2,
          companyId: 1,
          category: "pto",
          description: "20 days",
          valueText: null,
          source: null,
          rawJson: null,
          fetchedAt: new Date(),
        } as unknown as CompanyBenefit,
      ],
    });
    const b = r.factors.find((f) => f.key === "benefits");
    expect(b).toBeDefined();
    // matched 401k (weight 100) + pto (weight 50) = 150 earned of 183.3 possible
    expect(b!.contribution).toBeGreaterThan(75);
    expect(b!.contribution).toBeLessThan(90);
    expect(b!.detail).toContain("2/3");
  });

  it("returns null benefits factor when priorities list is empty", () => {
    const r = computeCompanyFitScore({
      company: mkCompany(),
      profile: mkProfile({ benefitPriorities: [] as never }),
      layoffs: [],
      benefits: [
        {
          id: 1,
          companyId: 1,
          category: "401k",
          description: "5% match",
          valueText: null,
          source: null,
          rawJson: null,
          fetchedAt: new Date(),
        } as unknown as CompanyBenefit,
      ],
    });
    expect(r.factors.find((f) => f.key === "benefits")).toBeUndefined();
  });

  it("computeCompanyFitScore is pure (multiple calls = same output)", () => {
    const input = {
      company: mkCompany({ glassdoorRating: "4.0" as never }),
      profile: mkProfile(),
      layoffs: [],
      benefits: [],
    };
    const a = computeCompanyFitScore(input);
    const b = computeCompanyFitScore(input);
    expect(a.score).toBe(b.score);
    expect(a.factors.length).toBe(b.factors.length);
  });
});
