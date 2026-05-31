import { describe, expect, it } from "vitest";
import { classifyJobSkills } from "./skill-classify";

describe("classifyJobSkills — user overrides", () => {
  it("'matched' override forces a chip green even when CV+portfolio have nothing", () => {
    const r = classifyJobSkills(
      "We need Java.",
      [],
      "",
      [],
      { matched: ["java"], missing: [] },
    );
    const java = r.classified.find((c) => c.token === "Java")!;
    expect(java.class).toBe("matched");
    expect(java.evidence).toBe("override");
    expect(java.overridden).toBe(true);
  });

  it("'missing' override forces a chip red even when CV has the skill", () => {
    const r = classifyJobSkills(
      "We need Python.",
      ["Python"],
      "",
      [],
      { matched: [], missing: ["python"] },
    );
    const py = r.classified.find((c) => c.token === "Python")!;
    expect(py.class).toBe("missing");
    expect(py.evidence).toBe("override");
    expect(py.overridden).toBe(true);
  });

  it("override matching is case-insensitive on both sides", () => {
    const r = classifyJobSkills(
      "Stack: JAVA, GraphQL.",
      [],
      "",
      [],
      { matched: ["JAVA"], missing: ["GRAPHQL"] },
    );
    expect(r.classified.find((c) => c.token === "Java")!.class).toBe("matched");
    expect(r.classified.find((c) => c.token === "GraphQL")!.class).toBe("missing");
  });

  it("falls back to CV/portfolio resolution when no override applies", () => {
    const r = classifyJobSkills(
      "We need Python.",
      ["Python"],
      "",
      [],
      { matched: [], missing: [] },
    );
    const py = r.classified.find((c) => c.token === "Python")!;
    expect(py.class).toBe("matched");
    expect(py.evidence).toBe("cv");
    expect(py.overridden).toBeUndefined();
  });

  it("override counts toward matched / missing tallies in coverage", () => {
    const r = classifyJobSkills(
      "Skills: Python and Rust.",
      ["Python"], // CV has Python; Rust has no source
      "",
      [],
      { matched: ["rust"], missing: [] }, // override Rust to matched
    );
    expect(r.matchedCount).toBe(2);
    expect(r.missingCount).toBe(0);
    expect(r.coveragePct).toBe(100);
  });

  it("empty overrides preserves prior behaviour completely", () => {
    const a = classifyJobSkills("Kubernetes.", ["Kubernetes"]);
    const b = classifyJobSkills(
      "Kubernetes.",
      ["Kubernetes"],
      "",
      [],
      { matched: [], missing: [] },
    );
    expect(a).toEqual(b);
  });
});
