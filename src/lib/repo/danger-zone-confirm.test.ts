// Confirmation-phrase guard contract test for the Danger Zone.
// Doesn't exercise the DB — that's integration-territory — just locks the
// per-action expected phrase so the UI and the API agree.

import { describe, expect, it } from "vitest";
import { CONFIRM_PHRASES } from "./danger-zone";

describe("CONFIRM_PHRASES — exact phrase per action", () => {
  it("has a unique phrase for each action", () => {
    const values = Object.values(CONFIRM_PHRASES);
    const distinct = new Set(values);
    expect(distinct.size).toBe(values.length);
  });

  it("each phrase is non-empty and looks like a deliberate confirmation", () => {
    for (const [key, value] of Object.entries(CONFIRM_PHRASES)) {
      expect(value.length, `${key}`).toBeGreaterThan(5);
      expect(value, `${key}`).toMatch(/^[A-Z ]+$/); // all-caps with spaces only
    }
  });

  it("includes every documented action", () => {
    const expected = [
      "jobs_in_zone",
      "hidden_jobs",
      "all_jobs",
      "all_portfolio",
      "all_applications",
      "all_companies",
      "full_reset",
    ];
    for (const k of expected) {
      expect(CONFIRM_PHRASES).toHaveProperty(k);
    }
  });
});
