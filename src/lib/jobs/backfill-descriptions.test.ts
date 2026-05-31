// Pure tests for the URL-parsing edge cases that bit us live.
// The full DB-backed backfill flow is integration-territory.

import { describe, expect, it } from "vitest";

function linkedinIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const slug = url.match(/linkedin\.com\/jobs\/view\/[^?#]*?(\d{8,12})(?:[?#/]|$)/i);
  return slug?.[1] ?? null;
}

describe("linkedinIdFromUrl", () => {
  it("returns null for empty / null", () => {
    expect(linkedinIdFromUrl(null)).toBeNull();
    expect(linkedinIdFromUrl(undefined)).toBeNull();
    expect(linkedinIdFromUrl("")).toBeNull();
  });

  it("extracts id from the canonical /jobs/view/{id} URL", () => {
    expect(linkedinIdFromUrl("https://www.linkedin.com/jobs/view/4397059864")).toBe(
      "4397059864",
    );
  });

  it("extracts id from a country-subdomain canonical URL", () => {
    expect(linkedinIdFromUrl("https://uk.linkedin.com/jobs/view/4417638618")).toBe(
      "4417638618",
    );
  });

  it("extracts id from a slugged URL with the id at the end", () => {
    expect(
      linkedinIdFromUrl(
        "https://uk.linkedin.com/jobs/view/sre-manager-ecommerce-at-oliver-bernard-4417638618",
      ),
    ).toBe("4417638618");
  });

  it("extracts id when the URL has trailing query / fragment / slash", () => {
    expect(
      linkedinIdFromUrl(
        "https://www.linkedin.com/jobs/view/4397059864?refId=foo",
      ),
    ).toBe("4397059864");
    expect(
      linkedinIdFromUrl("https://www.linkedin.com/jobs/view/4397059864/"),
    ).toBe("4397059864");
    expect(
      linkedinIdFromUrl("https://www.linkedin.com/jobs/view/4397059864#section"),
    ).toBe("4397059864");
  });

  it("does not over-match: returns null for non-job-view paths", () => {
    expect(linkedinIdFromUrl("https://www.linkedin.com/company/acme")).toBeNull();
    expect(linkedinIdFromUrl("https://example.com/jobs/view/4397059864")).toBeNull();
  });

  it("rejects too-short numeric runs", () => {
    expect(
      linkedinIdFromUrl("https://www.linkedin.com/jobs/view/slug-123"),
    ).toBeNull();
  });
});
