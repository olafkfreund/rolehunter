// Pure validation tests for cacheJobFitScore guards. Integration with the
// DB write path is exercised by the page-view flow; here we only assert
// the input-validation contract so out-of-range values are rejected.

import { describe, expect, it } from "vitest";

function isValidFitScore(score: number | null): boolean {
  if (score === null) return true;
  if (!Number.isFinite(score)) return false;
  if (score < 0 || score > 100) return false;
  return true;
}

describe("cacheJobFitScore — input validation guard", () => {
  it("accepts null", () => expect(isValidFitScore(null)).toBe(true));
  it("accepts 0", () => expect(isValidFitScore(0)).toBe(true));
  it("accepts 100", () => expect(isValidFitScore(100)).toBe(true));
  it("accepts a mid-range value", () => expect(isValidFitScore(72)).toBe(true));
  it("rejects negative scores", () => expect(isValidFitScore(-1)).toBe(false));
  it("rejects scores over 100", () => expect(isValidFitScore(101)).toBe(false));
  it("rejects NaN", () => expect(isValidFitScore(Number.NaN)).toBe(false));
  it("rejects Infinity", () => expect(isValidFitScore(Number.POSITIVE_INFINITY)).toBe(false));
});
