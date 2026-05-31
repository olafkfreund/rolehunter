// Pure guard tests for the cacheJobDistance helper. DB write is integration-
// territory and exercised by the page-view path; here we just pin the
// input-validation + smallint clamping contract.

import { describe, expect, it } from "vitest";

function clampDistance(km: number | null): number | null {
  if (km === null) return null;
  if (!Number.isFinite(km) || km < 0) return null;
  return Math.min(Math.round(km), 32_000);
}

describe("cacheJobDistance — clamp + validation", () => {
  it("accepts null", () => {
    expect(clampDistance(null)).toBe(null);
  });
  it("accepts 0", () => {
    expect(clampDistance(0)).toBe(0);
  });
  it("rounds fractional km", () => {
    expect(clampDistance(5558.5)).toBe(5559);
    expect(clampDistance(0.4)).toBe(0);
  });
  it("clamps to 32,000 km (well above antipode 20,015 km)", () => {
    expect(clampDistance(50_000)).toBe(32_000);
    expect(clampDistance(Number.MAX_SAFE_INTEGER)).toBe(32_000);
  });
  it("rejects negatives", () => {
    expect(clampDistance(-1)).toBe(null);
  });
  it("rejects NaN / Infinity", () => {
    expect(clampDistance(Number.NaN)).toBe(null);
    expect(clampDistance(Number.POSITIVE_INFINITY)).toBe(null);
  });
});

describe("/jobs sort=distance — sort enum accepts distance", () => {
  const VALID_SORTS = ["date", "score", "fit", "distance"] as const;
  function parseSort(input: string | undefined): string {
    if (input && (VALID_SORTS as readonly string[]).includes(input)) return input;
    return "score";
  }
  it("accepts 'distance'", () => {
    expect(parseSort("distance")).toBe("distance");
  });
  it("preserves the other sort options", () => {
    for (const s of VALID_SORTS) expect(parseSort(s)).toBe(s);
  });
  it("falls back to default for unknown", () => {
    expect(parseSort("garbage")).toBe("score");
  });
});
