import { describe, expect, it } from "vitest";
import {
  classifyLocationZone,
  jobLocationMatchesRightToWork,
} from "./right-to-work";

describe("classifyLocationZone", () => {
  it("returns Unknown for empty/null", () => {
    expect(classifyLocationZone(null)).toBe("Unknown");
    expect(classifyLocationZone(undefined)).toBe("Unknown");
    expect(classifyLocationZone("")).toBe("Unknown");
  });

  it("returns Unknown for bare 'Remote' / 'Anywhere'", () => {
    expect(classifyLocationZone("Remote")).toBe("Unknown");
    expect(classifyLocationZone("  remote ")).toBe("Unknown");
    expect(classifyLocationZone("Anywhere")).toBe("Unknown");
  });

  it("classifies US explicitly", () => {
    expect(classifyLocationZone("USA")).toBe("US");
    expect(classifyLocationZone("San Francisco, USA")).toBe("US");
    expect(classifyLocationZone("United States of America")).toBe("US");
  });

  it("classifies US via 2-letter state code", () => {
    expect(classifyLocationZone("San Francisco, CA")).toBe("US");
    expect(classifyLocationZone("Austin, TX")).toBe("US");
    expect(classifyLocationZone("New York, NY")).toBe("US");
    expect(classifyLocationZone("Washington, DC")).toBe("US");
  });

  it("classifies US via full state name", () => {
    expect(classifyLocationZone("Boston, Massachusetts")).toBe("US");
    expect(classifyLocationZone("Indianapolis, Indiana")).toBe("US");
  });

  it("classifies UK", () => {
    expect(classifyLocationZone("London, UK")).toBe("UK");
    expect(classifyLocationZone("Manchester, United Kingdom")).toBe("UK");
    expect(classifyLocationZone("Edinburgh, Scotland")).toBe("UK");
    expect(classifyLocationZone("Belfast, Northern Ireland")).toBe("UK");
  });

  it("classifies EU member states", () => {
    expect(classifyLocationZone("Berlin, Germany")).toBe("EU");
    expect(classifyLocationZone("Paris, France")).toBe("EU");
    expect(classifyLocationZone("Amsterdam, Netherlands")).toBe("EU");
    expect(classifyLocationZone("Dublin, Ireland")).toBe("EU");
  });

  it("classifies Canada", () => {
    expect(classifyLocationZone("Toronto, Canada")).toBe("CA");
    expect(classifyLocationZone("Vancouver, BC")).toBe("CA"); // — wait, "BC" isn't in the table; this should be CA via "Vancouver"
  });

  it("classifies Australia", () => {
    expect(classifyLocationZone("Sydney, Australia")).toBe("AU");
    expect(classifyLocationZone("Melbourne, VIC")).toBe("AU");
  });

  it("classifies India (avoiding the 'IN' state-code clash)", () => {
    expect(classifyLocationZone("Bangalore, India")).toBe("IN");
    expect(classifyLocationZone("Mumbai")).toBe("IN");
    // "Indianapolis, IN" should be US, not India
    expect(classifyLocationZone("Indianapolis, IN")).toBe("US");
  });

  it("classifies NZ", () => {
    expect(classifyLocationZone("Auckland, New Zealand")).toBe("NZ");
  });

  it("classifies MENA", () => {
    expect(classifyLocationZone("Dubai, UAE")).toBe("MENA");
    expect(classifyLocationZone("Riyadh, Saudi Arabia")).toBe("MENA");
    expect(classifyLocationZone("Tel Aviv, Israel")).toBe("MENA");
  });

  it("returns Unknown for unparseable strings", () => {
    expect(classifyLocationZone("Somewhere over the rainbow")).toBe("Unknown");
    expect(classifyLocationZone("Various locations")).toBe("Unknown");
  });
});

describe("jobLocationMatchesRightToWork", () => {
  it("returns true when no zones declared (filter inactive)", () => {
    expect(jobLocationMatchesRightToWork("London, UK", [])).toBe(true);
    expect(jobLocationMatchesRightToWork("San Francisco, CA", [])).toBe(true);
  });

  it("returns true when zone matches a declared one", () => {
    expect(jobLocationMatchesRightToWork("London, UK", ["UK"])).toBe(true);
    expect(jobLocationMatchesRightToWork("Berlin, Germany", ["UK", "EU"])).toBe(true);
  });

  it("returns false when zone is clearly outside declared zones", () => {
    expect(jobLocationMatchesRightToWork("San Francisco, CA", ["UK"])).toBe(false);
    expect(jobLocationMatchesRightToWork("Toronto, Canada", ["UK", "EU"])).toBe(false);
  });

  it("returns true for Unknown locations even with strict filter (false-negative-safe)", () => {
    expect(jobLocationMatchesRightToWork("Remote", ["UK"])).toBe(true);
    expect(jobLocationMatchesRightToWork(null, ["UK"])).toBe(true);
    expect(jobLocationMatchesRightToWork("", ["UK"])).toBe(true);
  });
});
