import { describe, expect, it } from "vitest";

import { detectAtsUrl } from "./ats-detect";

function detect(url: string) {
  return detectAtsUrl(new URL(url));
}

describe("detectAtsUrl", () => {
  it("detects Greenhouse board URLs", () => {
    expect(detect("https://boards.greenhouse.io/acme/jobs/4567")).toEqual({
      ats: "greenhouse",
      slug: "acme",
      jobId: "4567",
    });
    expect(detect("https://job-boards.greenhouse.io/acme/jobs/4567")).toEqual({
      ats: "greenhouse",
      slug: "acme",
      jobId: "4567",
    });
  });

  it("detects Lever URLs", () => {
    expect(detect("https://jobs.lever.co/acme/abcd-1234-uuid")).toEqual({
      ats: "lever",
      slug: "acme",
      jobId: "abcd-1234-uuid",
    });
  });

  it("detects Ashby URLs", () => {
    expect(detect("https://jobs.ashbyhq.com/acme/abcd-uuid")).toEqual({
      ats: "ashby",
      slug: "acme",
      jobId: "abcd-uuid",
    });
  });

  it("detects Workable apply URLs", () => {
    expect(detect("https://apply.workable.com/acme/j/ABC123/")).toEqual({
      ats: "workable",
      slug: "acme",
      jobId: "ABC123",
    });
  });

  it("detects SmartRecruiters URLs and extracts the numeric posting id", () => {
    expect(detect("https://jobs.smartrecruiters.com/Acme/743999-senior-engineer")).toEqual({
      ats: "smartrecruiters",
      slug: "Acme",
      jobId: "743999",
    });
  });

  it("returns null for non-ATS hosts", () => {
    expect(detect("https://example.com/careers/123")).toBeNull();
    expect(detect("https://www.linkedin.com/jobs/view/123")).toBeNull();
  });

  it("returns null for an ATS host without a parseable job path", () => {
    expect(detect("https://boards.greenhouse.io/acme")).toBeNull();
    expect(detect("https://jobs.lever.co/acme")).toBeNull();
  });
});
