import { describe, expect, it } from "vitest";
import { extractTechTokens, TECH_TOKENS } from "./tech-tokens";

describe("tech-tokens.extractTechTokens", () => {
  it("returns empty for empty input", () => {
    expect(extractTechTokens("")).toEqual([]);
    expect(extractTechTokens("   ")).toEqual([]);
  });

  it("finds a single canonical token", () => {
    const out = extractTechTokens("We use Kubernetes for orchestration.");
    expect(out).toContain("Kubernetes");
  });

  it("is case-insensitive on the haystack", () => {
    expect(extractTechTokens("we use kubernetes here")).toContain("Kubernetes");
    expect(extractTechTokens("WE USE KUBERNETES")).toContain("Kubernetes");
  });

  it("respects word boundaries — does not match 'React' inside 'Reacted'", () => {
    const out = extractTechTokens("Reacted to the team feedback.");
    expect(out).not.toContain("React");
  });

  it("handles tokens with dots and pluses correctly", () => {
    expect(extractTechTokens("our stack: Next.js 15")).toContain("Next.js");
    expect(extractTechTokens("legacy C++ codebase")).toContain("C++");
    expect(extractTechTokens("we love C#")).toContain("C#");
  });

  it("does not return duplicates when a token appears twice", () => {
    const out = extractTechTokens("Python is great. We use Python every day.");
    const pythons = out.filter((t) => t === "Python");
    expect(pythons.length).toBe(1);
  });

  it("matches multi-word tokens with arbitrary whitespace", () => {
    expect(extractTechTokens("we run on Google Cloud Platform")).toContain("Google Cloud");
    expect(extractTechTokens("our IaC is GitHub Actions based")).toContain("GitHub Actions");
  });

  it("includes a broad set of platform/language tokens", () => {
    expect(TECH_TOKENS).toContain("PostgreSQL");
    expect(TECH_TOKENS).toContain("Rust");
    expect(TECH_TOKENS).toContain("TypeScript");
    expect(TECH_TOKENS).toContain("AWS");
  });

  describe("unverified skills check", () => {
    it("identifies tailored skills absent from master CV", () => {
      const master = "I write TypeScript and React.";
      const tailored = "I write TypeScript, React, and Kubernetes, deploying to AWS.";
      const masterTokens = extractTechTokens(master);
      const tailoredTokens = extractTechTokens(tailored);
      const unverified = tailoredTokens.filter(
        (t) => !masterTokens.some((mt) => mt.toLowerCase() === t.toLowerCase()),
      );
      expect(unverified).toContain("Kubernetes");
      expect(unverified).toContain("AWS");
      expect(unverified).not.toContain("TypeScript");
      expect(unverified).not.toContain("React");
    });

    it("returns empty array when all tailored skills are in master CV", () => {
      const master = "Expertise in AWS, Terraform, and Python.";
      const tailored = "We used Python and Terraform on AWS.";
      const masterTokens = extractTechTokens(master);
      const tailoredTokens = extractTechTokens(tailored);
      const unverified = tailoredTokens.filter(
        (t) => !masterTokens.some((mt) => mt.toLowerCase() === t.toLowerCase()),
      );
      expect(unverified).toEqual([]);
    });
  });
});
