import { describe, expect, it } from "vitest";
import { classifyJobSkills } from "./skill-classify";

describe("skill-classify.classifyJobSkills", () => {
  it("returns empty result when JD has no tech tokens", () => {
    const r = classifyJobSkills("We're looking for someone passionate about people.", [
      "Python",
    ]);
    expect(r.jobTokens).toEqual([]);
    expect(r.classified).toEqual([]);
    expect(r.matchedCount).toBe(0);
    expect(r.partialCount).toBe(0);
    expect(r.missingCount).toBe(0);
    expect(r.coveragePct).toBe(0);
  });

  it("classifies an exact match as 'matched'", () => {
    const r = classifyJobSkills("We use Kubernetes.", ["Kubernetes"]);
    expect(r.classified).toHaveLength(1);
    expect(r.classified[0].class).toBe("matched");
    expect(r.classified[0].token).toBe("Kubernetes");
    expect(r.matchedCount).toBe(1);
    expect(r.coveragePct).toBe(100);
  });

  it("matches CV terms case-insensitively", () => {
    const r = classifyJobSkills("Kubernetes is required.", ["kubernetes"]);
    expect(r.classified[0].class).toBe("matched");
  });

  it("normalises dots/dashes/spaces for matching (Next.js ↔ nextjs)", () => {
    const r = classifyJobSkills("We're on Next.js.", ["nextjs"]);
    expect(r.classified[0].class).toBe("matched");
  });

  it("classifies a family-sibling as 'partial' (PostgreSQL JD vs MySQL CV)", () => {
    const r = classifyJobSkills("Strong PostgreSQL background needed.", ["MySQL"]);
    expect(r.classified[0].class).toBe("partial");
    expect(r.classified[0].cvMatch?.toLowerCase()).toBe("mysql");
  });

  it("classifies an unrelated skill as 'missing'", () => {
    const r = classifyJobSkills("Strong PostgreSQL background needed.", ["Python"]);
    expect(r.classified[0].class).toBe("missing");
    expect(r.classified[0].cvMatch).toBeNull();
  });

  it("computes coverage as matched + 0.5 partial / total", () => {
    const r = classifyJobSkills(
      "We use Kubernetes, PostgreSQL, and Datadog.",
      ["Kubernetes", "MySQL"],
    );
    // Kubernetes → matched, PostgreSQL → partial (MySQL family), Datadog → missing
    expect(r.matchedCount).toBe(1);
    expect(r.partialCount).toBe(1);
    expect(r.missingCount).toBe(1);
    // (1 + 0.5*1) / 3 = 0.5 → 50%
    expect(r.coveragePct).toBe(50);
  });

  it("scans the job title in addition to the description when provided", () => {
    const r = classifyJobSkills(
      "Mostly about people skills.",
      ["Kubernetes"],
      "Senior Kubernetes Engineer",
    );
    expect(r.classified[0].class).toBe("matched");
    expect(r.classified[0].token).toBe("Kubernetes");
  });

  it("handles a missing CV gracefully", () => {
    const r = classifyJobSkills("We use Kubernetes.", undefined);
    expect(r.classified[0].class).toBe("missing");
    expect(r.missingCount).toBe(1);
  });
});
