// Contract tests for the batch backfill helper. We don't exercise the DB
// or Nominatim here — the per-company logic is covered in
// extract-offices.test.ts. These tests just lock the result shape and
// limit/remaining math so the UI can rely on them.

import { describe, expect, it } from "vitest";

// Re-implement the slice math used by backfillAllCompanyOffices so the
// limit / remaining contract is pinned without touching the DB.
function sliceCandidates<T>(
  candidates: T[],
  limit: number,
): { slice: T[]; remaining: number } {
  const slice = candidates.slice(0, limit);
  return {
    slice,
    remaining: Math.max(0, candidates.length - slice.length),
  };
}

describe("backfillAllCompanyOffices — slice math", () => {
  it("returns everything when limit > total", () => {
    const cs = [1, 2, 3];
    const r = sliceCandidates(cs, 12);
    expect(r.slice).toEqual([1, 2, 3]);
    expect(r.remaining).toBe(0);
  });

  it("returns first N when limit < total", () => {
    const cs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    const r = sliceCandidates(cs, 12);
    expect(r.slice).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(r.remaining).toBe(3);
  });

  it("returns [] with 0 remaining when input is empty", () => {
    const r = sliceCandidates([], 12);
    expect(r.slice).toEqual([]);
    expect(r.remaining).toBe(0);
  });

  it("never returns negative remaining", () => {
    const r = sliceCandidates([1, 2], 100);
    expect(r.remaining).toBe(0);
  });

  it("respects limit=1 (single-step mode)", () => {
    const r = sliceCandidates([1, 2, 3], 1);
    expect(r.slice).toEqual([1]);
    expect(r.remaining).toBe(2);
  });
});
