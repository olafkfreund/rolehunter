import { describe, expect, it } from "vitest";
import { clearbitLogoUrl } from "./clearbit";

describe("clearbit.clearbitLogoUrl", () => {
  it("returns null for null/undefined input", () => {
    expect(clearbitLogoUrl(null)).toBeNull();
    expect(clearbitLogoUrl(undefined)).toBeNull();
    expect(clearbitLogoUrl("")).toBeNull();
  });

  it("builds the canonical Clearbit URL from an https origin", () => {
    expect(clearbitLogoUrl("https://stripe.com")).toBe("https://logo.clearbit.com/stripe.com");
  });

  it("strips a leading www.", () => {
    expect(clearbitLogoUrl("https://www.cognizant.com")).toBe(
      "https://logo.clearbit.com/cognizant.com",
    );
  });

  it("falls back to prepending https:// for bare hosts", () => {
    expect(clearbitLogoUrl("stripe.com")).toBe("https://logo.clearbit.com/stripe.com");
  });

  it("rejects localhost", () => {
    expect(clearbitLogoUrl("http://localhost")).toBeNull();
  });

  it("preserves a path-suffixed URL but only uses the host", () => {
    expect(clearbitLogoUrl("https://stripe.com/jobs")).toBe(
      "https://logo.clearbit.com/stripe.com",
    );
  });
});
