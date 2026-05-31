import { describe, expect, it } from "vitest";
import {
  canonicalCity,
  cleanLocationString,
  distinctCityCandidates,
} from "./extract-offices";

describe("cleanLocationString", () => {
  it("returns [] for empty input", () => {
    expect(cleanLocationString("")).toEqual([]);
  });

  it("strips a leading 'Remote — ' prefix", () => {
    expect(cleanLocationString("Remote — London, UK")).toEqual(["London, UK"]);
  });

  it("strips a leading 'Hybrid - '", () => {
    expect(cleanLocationString("Hybrid - Berlin")).toEqual(["Berlin"]);
  });

  it("strips trailing - Remote / - Hybrid markers", () => {
    expect(cleanLocationString("Paris - Hybrid")).toEqual(["Paris"]);
    expect(cleanLocationString("Tokyo - Remote")).toEqual(["Tokyo"]);
  });

  it("removes parenthetical suffixes", () => {
    expect(cleanLocationString("London (Hybrid)")).toEqual(["London"]);
  });

  it("splits multi-city strings on slash and pipe", () => {
    expect(cleanLocationString("London / Berlin / Paris")).toEqual([
      "London",
      "Berlin",
      "Paris",
    ]);
    expect(cleanLocationString("NYC | SF")).toEqual(["NYC", "SF"]);
  });
});

describe("canonicalCity", () => {
  it("returns the first comma fragment", () => {
    expect(canonicalCity("London, England, United Kingdom")).toBe("London");
  });

  it("rejects too-short cities", () => {
    expect(canonicalCity("NY")).toBeNull();
  });

  it("rejects clearly non-location tokens", () => {
    expect(canonicalCity("Remote")).toBeNull();
    expect(canonicalCity("Anywhere")).toBeNull();
    expect(canonicalCity("Multiple locations")).toBeNull();
    expect(canonicalCity("EU")).toBeNull();
    expect(canonicalCity("United States")).toBeNull();
  });

  it("rejects null/empty", () => {
    expect(canonicalCity("")).toBeNull();
  });

  it("accepts a multi-word city", () => {
    expect(canonicalCity("San Francisco, CA")).toBe("San Francisco");
  });
});

describe("distinctCityCandidates", () => {
  it("dedupes case-insensitively", () => {
    const result = distinctCityCandidates([
      "London, UK",
      "london",
      "London, England, United Kingdom",
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].city.toLowerCase()).toBe("london");
    // Keeps the longest variant for geocoding context
    expect(result[0].fullest).toContain("United Kingdom");
  });

  it("returns multiple distinct cities", () => {
    const result = distinctCityCandidates([
      "London, UK",
      "Berlin, Germany",
      "Tokyo, Japan",
    ]);
    expect(result).toHaveLength(3);
  });

  it("ignores null / undefined / empty entries", () => {
    const result = distinctCityCandidates([
      null,
      undefined,
      "",
      "  ",
      "Remote",
      "London",
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].city.toLowerCase()).toBe("london");
  });

  it("handles multi-city listings", () => {
    const result = distinctCityCandidates(["London / Berlin"]);
    expect(result.map((r) => r.city.toLowerCase()).sort()).toEqual([
      "berlin",
      "london",
    ]);
  });

  it("strips remote prefixes before extracting city", () => {
    const result = distinctCityCandidates(["Remote — Paris, France"]);
    expect(result).toHaveLength(1);
    expect(result[0].city.toLowerCase()).toBe("paris");
  });
});
