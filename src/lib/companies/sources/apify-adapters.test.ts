import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rowsToBenefits } from "./levels-fyi";
import { eventsToNewLayoffs } from "./layoffs-fyi";
import { rowsToConnections } from "./linkedin-company";
import { lookupCompanyOnLevelsFyi } from "./levels-fyi";
import { lookupCompanyLayoffs } from "./layoffs-fyi";
import { lookupCompanyEmployees } from "./linkedin-company";

describe("levels-fyi.rowsToBenefits", () => {
  it("converts a row with all comp components into one benefit entry", () => {
    const out = rowsToBenefits([
      {
        level: "L5",
        title: "Senior",
        totalCompUsd: 500_000,
        baseUsd: 250_000,
        stockUsd: 200_000,
        bonusUsd: 50_000,
        sampleSize: 12,
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].category).toBe("equity");
    expect(out[0].description).toBe("L5 / Senior");
    expect(out[0].valueText).toContain("TC $500,000");
    expect(out[0].valueText).toContain("base $250,000");
    expect(out[0].source).toBe("levels.fyi");
  });

  it("skips rows with no usable comp data", () => {
    const out = rowsToBenefits([
      {
        level: "L5",
        title: "Senior",
        totalCompUsd: null,
        baseUsd: null,
        stockUsd: null,
        bonusUsd: null,
        sampleSize: null,
      },
    ]);
    expect(out).toEqual([]);
  });

  it("skips rows with no level and no title", () => {
    const out = rowsToBenefits([
      {
        level: null,
        title: null,
        totalCompUsd: 100_000,
        baseUsd: null,
        stockUsd: null,
        bonusUsd: null,
        sampleSize: null,
      },
    ]);
    expect(out).toEqual([]);
  });
});

describe("layoffs-fyi.eventsToNewLayoffs", () => {
  it("passes through the fields the repo helper expects", () => {
    const out = eventsToNewLayoffs([
      {
        announcedAt: "2026-03-15T00:00:00.000Z",
        affectedCount: 500,
        percentOfWorkforce: 12.5,
        summary: "Engineering reorg",
        sourceUrl: "https://news.example.com/1",
        rawJson: { foo: "bar" },
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].affectedCount).toBe(500);
    expect(out[0].percentOfWorkforce).toBe(12.5);
    expect(out[0].announcedAt).toBe("2026-03-15T00:00:00.000Z");
    expect(out[0].rawJson).toEqual({ foo: "bar" });
  });
});

describe("linkedin-company.rowsToConnections", () => {
  it("preserves kind + name + headline + linkedin url", () => {
    const out = rowsToConnections([
      {
        kind: "current_employee",
        name: "Jane Doe",
        headline: "Staff Engineer at Acme",
        linkedinUrl: "https://linkedin.com/in/janedoe",
        rawJson: { raw: 1 },
      },
      {
        kind: "alumni",
        name: "John Roe",
        headline: null,
        linkedinUrl: null,
        rawJson: {},
      },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].kind).toBe("current_employee");
    expect(out[0].name).toBe("Jane Doe");
    expect(out[1].kind).toBe("alumni");
  });
});

describe("apify adapters — graceful skip when env unset", () => {
  const originalToken = process.env.APIFY_API_TOKEN;
  const originalLevels = process.env.APIFY_LEVELS_FYI_ACTOR_ID;
  const originalLayoffs = process.env.APIFY_LAYOFFS_ACTOR_ID;
  const originalLi = process.env.APIFY_LINKEDIN_COMPANY_ACTOR_ID;

  beforeEach(() => {
    delete process.env.APIFY_API_TOKEN;
    delete process.env.APIFY_LEVELS_FYI_ACTOR_ID;
    delete process.env.APIFY_LAYOFFS_ACTOR_ID;
    delete process.env.APIFY_LINKEDIN_COMPANY_ACTOR_ID;
  });

  afterEach(() => {
    if (originalToken) process.env.APIFY_API_TOKEN = originalToken;
    if (originalLevels) process.env.APIFY_LEVELS_FYI_ACTOR_ID = originalLevels;
    if (originalLayoffs) process.env.APIFY_LAYOFFS_ACTOR_ID = originalLayoffs;
    if (originalLi) process.env.APIFY_LINKEDIN_COMPANY_ACTOR_ID = originalLi;
  });

  it("levels.fyi returns null when env is missing", async () => {
    expect(await lookupCompanyOnLevelsFyi("Stripe")).toBeNull();
  });
  it("layoffs returns null when env is missing", async () => {
    expect(await lookupCompanyLayoffs("Stripe")).toBeNull();
  });
  it("linkedin-company returns null when env is missing", async () => {
    expect(await lookupCompanyEmployees("Stripe")).toBeNull();
  });
});
