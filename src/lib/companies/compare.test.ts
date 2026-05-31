// compare.test.ts — pure tests for the helpers consumed by the comparison
// UI. The DB-backed listApplicationCompanies() requires a running DB so
// it's covered by integration tests, not here.

import { describe, expect, it } from "vitest";
import { haversineKm } from "@/lib/companies/geo";

describe("compare helpers — haversine consistency", () => {
  it("0 km between identical points", () => {
    const a = { lat: 51.5, lng: -0.1, displayName: "" };
    expect(haversineKm(a, a)).toBe(0);
  });

  it("London → New York is ~5,570 km", () => {
    const london = { lat: 51.5074, lng: -0.1278, displayName: "" };
    const newYork = { lat: 40.7128, lng: -74.006, displayName: "" };
    const km = haversineKm(london, newYork);
    expect(km).toBeGreaterThan(5_500);
    expect(km).toBeLessThan(5_650);
  });

  it("London → Paris is ~344 km", () => {
    const london = { lat: 51.5074, lng: -0.1278, displayName: "" };
    const paris = { lat: 48.8566, lng: 2.3522, displayName: "" };
    const km = haversineKm(london, paris);
    expect(km).toBeGreaterThan(330);
    expect(km).toBeLessThan(360);
  });

  it("identical points across the prime meridian", () => {
    // Sanity: ~111 km per degree latitude near the equator
    const a = { lat: 0, lng: 0, displayName: "" };
    const b = { lat: 1, lng: 0, displayName: "" };
    const km = haversineKm(a, b);
    expect(km).toBeGreaterThan(110);
    expect(km).toBeLessThan(112);
  });
});
