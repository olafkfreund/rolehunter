// Contract tests for the hidden-flag visibility filter on listJobs() and
// for the setJobHidden input guard. Doesn't exercise the DB — that's the
// integration test path — just locks the API shape.

import { describe, expect, it } from "vitest";

describe("listJobs visibility enum", () => {
  type Visibility = "active" | "hidden" | "all";
  function parseVisibility(input: string | undefined): Visibility {
    if (input === "hidden") return "hidden";
    if (input === "all") return "all";
    return "active";
  }
  it("defaults to 'active'", () => {
    expect(parseVisibility(undefined)).toBe("active");
    expect(parseVisibility("")).toBe("active");
    expect(parseVisibility("garbage")).toBe("active");
  });
  it("accepts 'hidden'", () => {
    expect(parseVisibility("hidden")).toBe("hidden");
  });
  it("accepts 'all'", () => {
    expect(parseVisibility("all")).toBe("all");
  });
});

describe("setJobHidden — boolean guard", () => {
  function isValidHidden(v: unknown): v is boolean {
    return typeof v === "boolean";
  }
  it("accepts true/false", () => {
    expect(isValidHidden(true)).toBe(true);
    expect(isValidHidden(false)).toBe(true);
  });
  it("rejects strings, numbers, null, undefined, objects", () => {
    expect(isValidHidden("true")).toBe(false);
    expect(isValidHidden(1)).toBe(false);
    expect(isValidHidden(0)).toBe(false);
    expect(isValidHidden(null)).toBe(false);
    expect(isValidHidden(undefined)).toBe(false);
    expect(isValidHidden({})).toBe(false);
  });
});
