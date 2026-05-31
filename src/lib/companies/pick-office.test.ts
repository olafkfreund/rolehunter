import { describe, expect, it } from "vitest";
import { locationTokensMatch, pickBestOffice, tokenizeLocation } from "./pick-office";
import type { CompanyOffice } from "@/lib/db/schema";

function office(p: Partial<CompanyOffice>): CompanyOffice {
  return {
    id: 0,
    companyId: 1,
    label: "",
    address: null,
    lat: null,
    lng: null,
    amenities: [],
    createdAt: new Date(),
    ...p,
  } as unknown as CompanyOffice;
}

describe("tokenizeLocation", () => {
  it("strips punctuation and lowercases", () => {
    const tokens = tokenizeLocation("London, England, United Kingdom");
    expect(tokens.has("london")).toBe(true);
  });
  it("drops common location stopwords", () => {
    const tokens = tokenizeLocation("London, England, United Kingdom");
    expect(tokens.has("united")).toBe(false);
    expect(tokens.has("kingdom")).toBe(false);
    expect(tokens.has("england")).toBe(false);
  });
  it("drops short tokens", () => {
    const tokens = tokenizeLocation("NY USA");
    expect(tokens.has("ny")).toBe(false);
  });
  it("returns empty set for null/empty", () => {
    expect(tokenizeLocation(null).size).toBe(0);
    expect(tokenizeLocation("").size).toBe(0);
  });
});

describe("locationTokensMatch", () => {
  it("matches on overlapping city tokens", () => {
    expect(locationTokensMatch("London, UK", "Canary Wharf, London E14")).toBe(true);
  });
  it("does not match unrelated cities", () => {
    expect(locationTokensMatch("London, UK", "Teaneck, New Jersey")).toBe(false);
  });
  it("returns false when either side is empty", () => {
    expect(locationTokensMatch(null, "London")).toBe(false);
    expect(locationTokensMatch("London", null)).toBe(false);
  });
});

describe("pickBestOffice", () => {
  const userPoint = { lat: 51.52, lng: -0.16, displayName: "" };
  const teaneckHq = { lat: 40.89, lng: -74.01, displayName: "" };

  it("falls back to HQ when no offices exist", () => {
    const r = pickBestOffice({
      userLocation: "London, UK",
      userPoint,
      hqPoint: teaneckHq,
      hqLabel: "HQ Teaneck",
      offices: [],
    });
    expect(r).not.toBeNull();
    expect(r!.source).toBe("hq-fallback");
    expect(r!.label).toBe("HQ Teaneck");
    expect(r!.office).toBeNull();
    expect(r!.point.lat).toBe(40.89);
  });

  it("picks the office matching the user's city by token", () => {
    const offices = [
      office({
        id: 1,
        label: "London",
        address: "10 Bishopsgate, London EC2N 4AY",
        lat: 51.515,
        lng: -0.082,
      }),
      office({
        id: 2,
        label: "Mumbai",
        address: "Mumbai, Maharashtra, India",
        lat: 19.07,
        lng: 72.87,
      }),
    ];
    const r = pickBestOffice({
      userLocation: "London, England, United Kingdom",
      userPoint,
      hqPoint: teaneckHq,
      hqLabel: "HQ Teaneck",
      offices,
    });
    expect(r).not.toBeNull();
    expect(r!.source).toBe("office-match-by-token");
    expect(r!.office?.id).toBe(1);
    expect(r!.label).toContain("London");
  });

  it("among multiple city matches picks the closest to the user", () => {
    const offices = [
      office({
        id: 1,
        label: "Canary Wharf",
        address: "Canary Wharf, London E14",
        lat: 51.504,
        lng: -0.019, // ~10 km east of userPoint
      }),
      office({
        id: 2,
        label: "Soho",
        address: "Soho, London W1",
        lat: 51.513,
        lng: -0.135, // ~2 km from userPoint
      }),
    ];
    const r = pickBestOffice({
      userLocation: "London",
      userPoint,
      hqPoint: teaneckHq,
      hqLabel: "HQ Teaneck",
      offices,
    });
    expect(r!.office?.id).toBe(2); // Soho wins
  });

  it("uses the closest office when no token matches but it beats HQ by >25%", () => {
    const offices = [
      office({
        id: 1,
        label: "Dublin",
        address: "Dublin, Ireland",
        lat: 53.35,
        lng: -6.26, // ~460 km from London
      }),
    ];
    const r = pickBestOffice({
      userLocation: "EU",
      userPoint,
      hqPoint: teaneckHq, // ~5,500 km away — Dublin is 460
      hqLabel: "HQ Teaneck",
      offices,
    });
    expect(r!.source).toBe("office-closest");
    expect(r!.office?.id).toBe(1);
  });

  it("stays on HQ when offices are not meaningfully closer", () => {
    // User is in NYC, company has HQ in Teaneck NJ (~10km) and an office in
    // London (~5,500km). HQ wins clearly.
    const nyc = { lat: 40.7128, lng: -74.006, displayName: "" };
    const offices = [
      office({
        id: 1,
        label: "London",
        address: "London, UK",
        lat: 51.5,
        lng: -0.12,
      }),
    ];
    const r = pickBestOffice({
      userLocation: "Newark, NJ",
      userPoint: nyc,
      hqPoint: teaneckHq,
      hqLabel: "HQ Teaneck",
      offices,
    });
    expect(r!.source).toBe("hq-fallback");
  });

  it("returns null when no HQ and no usable offices exist", () => {
    const r = pickBestOffice({
      userLocation: "London",
      userPoint,
      hqPoint: null,
      hqLabel: "HQ unknown",
      offices: [],
    });
    expect(r).toBeNull();
  });

  it("skips offices missing lat/lng", () => {
    const offices = [
      office({ id: 1, label: "London", address: "London, UK", lat: null, lng: null }),
    ];
    const r = pickBestOffice({
      userLocation: "London",
      userPoint,
      hqPoint: teaneckHq,
      hqLabel: "HQ Teaneck",
      offices,
    });
    expect(r!.source).toBe("hq-fallback");
  });
});
