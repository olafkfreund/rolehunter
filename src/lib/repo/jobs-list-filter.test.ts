// Pure tests for the sort+filter parsing contract used by /jobs.
// We don't exercise the SQL — that's integration-territory — but we lock the
// input-shape contract so the page can rely on the type/string enum.

import { describe, expect, it } from "vitest";

const VALID_BANDS = ["all", "top", "stretch", "pass", "unscored"] as const;
const VALID_SORTS = ["date", "score", "fit"] as const;

function parseBand(input: string | string[] | undefined): string {
  const raw = Array.isArray(input) ? input[0] : input;
  if (raw && (VALID_BANDS as readonly string[]).includes(raw)) return raw;
  return "all";
}

function parseSort(input: string | string[] | undefined): string {
  const raw = Array.isArray(input) ? input[0] : input;
  if (raw && (VALID_SORTS as readonly string[]).includes(raw)) return raw;
  return "score";
}

describe("/jobs query parsing", () => {
  it("defaults band to 'all' on missing/invalid input", () => {
    expect(parseBand(undefined)).toBe("all");
    expect(parseBand("")).toBe("all");
    expect(parseBand("garbage")).toBe("all");
  });
  it("accepts every valid band", () => {
    for (const b of VALID_BANDS) expect(parseBand(b)).toBe(b);
  });
  it("takes the first element when given an array", () => {
    expect(parseBand(["top", "pass"])).toBe("top");
  });

  it("defaults sort to 'score' on missing/invalid input", () => {
    expect(parseSort(undefined)).toBe("score");
    expect(parseSort("garbage")).toBe("score");
  });
  it("accepts every valid sort", () => {
    for (const s of VALID_SORTS) expect(parseSort(s)).toBe(s);
  });
});

describe("/jobs href builder contract", () => {
  function buildHref(
    base: Record<string, string | undefined>,
    patch: Record<string, string | null>,
  ): string {
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(base)) if (v) next[k] = v;
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) delete next[k];
      else next[k] = v;
    }
    const sp = new URLSearchParams(next);
    const qs = sp.toString();
    return qs ? `/jobs?${qs}` : "/jobs";
  }

  it("returns /jobs with no params when everything is cleared", () => {
    expect(buildHref({}, {})).toBe("/jobs");
    expect(buildHref({ band: "top" }, { band: null })).toBe("/jobs");
  });

  it("preserves base params not mentioned in the patch", () => {
    expect(buildHref({ band: "top" }, { sort: "fit" })).toBe(
      "/jobs?band=top&sort=fit",
    );
  });

  it("overrides a base param with the patch value", () => {
    expect(buildHref({ band: "top" }, { band: "stretch" })).toBe(
      "/jobs?band=stretch",
    );
  });

  it("ignores undefined base values", () => {
    expect(buildHref({ band: undefined, fit: "top" }, {})).toBe("/jobs?fit=top");
  });
});
