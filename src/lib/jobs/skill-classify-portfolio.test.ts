import { describe, expect, it } from "vitest";
import { classifyJobSkills } from "./skill-classify";

describe("classifyJobSkills — portfolio as a skill source", () => {
  it("matches a JD token that's in portfolio but not in CV skills", () => {
    const r = classifyJobSkills(
      "We need someone with strong Rust experience.",
      ["Python"], // CV has Python only
      "Senior Engineer",
      [
        { token: "Rust", project: "tdf — Terminal file viewer" },
        { token: "Python", project: "data-tooling" },
      ],
    );
    const rust = r.classified.find((c) => c.token === "Rust")!;
    expect(rust.class).toBe("matched");
    expect(rust.evidence).toBe("portfolio");
    expect(rust.portfolioProject).toBe("tdf — Terminal file viewer");
  });

  it("prefers CV evidence over portfolio when both have the token", () => {
    const r = classifyJobSkills(
      "We use Python at scale.",
      ["Python"],
      "",
      [{ token: "Python", project: "some-project" }],
    );
    const py = r.classified.find((c) => c.token === "Python")!;
    expect(py.class).toBe("matched");
    expect(py.evidence).toBe("cv");
  });

  it("classifies as missing when neither CV nor portfolio has the token", () => {
    const r = classifyJobSkills(
      "We use Rust extensively.",
      ["Python"],
      "",
      [{ token: "Go", project: "some-project" }],
    );
    const rust = r.classified.find((c) => c.token === "Rust")!;
    expect(rust.class).toBe("missing");
    expect(rust.evidence).toBeUndefined();
  });

  it("portfolio family-partial fires when JD wants PostgreSQL and portfolio has MySQL", () => {
    const r = classifyJobSkills(
      "Strong PostgreSQL background needed.",
      [], // empty CV
      "",
      [{ token: "MySQL", project: "legacy-app" }],
    );
    const pg = r.classified.find((c) => c.token === "PostgreSQL")!;
    expect(pg.class).toBe("partial");
    expect(pg.evidence).toBe("portfolio");
    expect(pg.portfolioProject).toBe("legacy-app");
  });

  it("coverage counts portfolio matches in matchedCount", () => {
    const r = classifyJobSkills(
      "We use Rust and Go.",
      [],
      "",
      [
        { token: "Rust", project: "p1" },
        { token: "Go", project: "p2" },
      ],
    );
    expect(r.matchedCount).toBe(2);
    expect(r.missingCount).toBe(0);
    expect(r.coveragePct).toBe(100);
  });

  it("normalises spelling for portfolio just like CV (next.js / nextjs)", () => {
    const r = classifyJobSkills(
      "Stack: Next.js.",
      [],
      "",
      [{ token: "nextjs", project: "p" }],
    );
    const nx = r.classified.find((c) => c.token === "Next.js")!;
    expect(nx.class).toBe("matched");
    expect(nx.evidence).toBe("portfolio");
  });

  it("empty portfolio array preserves CV-only behavior (no regression)", () => {
    const r = classifyJobSkills(
      "We use Kubernetes.",
      ["Kubernetes"],
      "",
      [],
    );
    const k = r.classified.find((c) => c.token === "Kubernetes")!;
    expect(k.class).toBe("matched");
    expect(k.evidence).toBe("cv");
  });
});
