import { describe, expect, it, vi } from "vitest";

import { normalizeKey, probeCompanyAts, slugCandidates } from "./ats-resolve";

describe("slugCandidates", () => {
  it("strips company suffixes and generates ordered candidates", () => {
    expect(slugCandidates("Acme Corp Ltd")).toEqual(["acme"]);
    expect(slugCandidates("Monzo Bank")).toEqual(["monzobank", "monzo-bank", "monzo"]);
  });

  it("expands ampersands into 'and'", () => {
    expect(slugCandidates("Marks & Spencer")).toEqual([
      "marksandspencer",
      "marks-and-spencer",
      "marks",
    ]);
  });

  it("returns [] for empty/garbage input", () => {
    expect(slugCandidates("   ")).toEqual([]);
    expect(slugCandidates("!!!")).toEqual([]);
  });
});

describe("normalizeKey", () => {
  it("lowercases and trims", () => {
    expect(normalizeKey("  Monzo Bank ")).toBe("monzo bank");
  });
});

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
const notFound = () => new Response("{}", { status: 404 });

describe("probeCompanyAts", () => {
  it("returns the first ATS that has a matching board (greenhouse before lever)", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("boards-api.greenhouse.io/v1/boards/monzo")) return ok({ name: "Monzo", id: 1 });
      return notFound();
    });
    const out = await probeCompanyAts("Monzo", fetchMock as unknown as typeof fetch);
    expect(out).toEqual({ ats: "greenhouse", slug: "monzo" });
  });

  it("falls through to Ashby and validates the response shape", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("api.ashbyhq.com/posting-api/job-board/wise")) return ok({ jobs: [] });
      return notFound();
    });
    const out = await probeCompanyAts("Wise", fetchMock as unknown as typeof fetch);
    expect(out).toEqual({ ats: "ashby", slug: "wise" });
  });

  it("does NOT match a 200 with the wrong shape (lever must be an array)", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      // Lever endpoint returns an object instead of an array → not a real board.
      if (u.includes("api.lever.co/v0/postings/acme")) return ok({ unexpected: true });
      return notFound();
    });
    const out = await probeCompanyAts("Acme", fetchMock as unknown as typeof fetch);
    expect(out).toBeNull();
  });

  it("returns null when no ATS matches", async () => {
    const fetchMock = vi.fn(async () => notFound());
    const out = await probeCompanyAts("Nonexistent Co", fetchMock as unknown as typeof fetch);
    expect(out).toBeNull();
  });
});
