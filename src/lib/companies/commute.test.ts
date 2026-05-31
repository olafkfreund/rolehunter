import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetCommuteCache,
  fetchCommuteEstimate,
  profileModeToGoogle,
} from "./commute";

const originalFetch = globalThis.fetch;
const originalKey = process.env.GOOGLE_MAPS_API_KEY;

describe("commute.profileModeToGoogle", () => {
  it("maps profile prefs to Google's transit enum", () => {
    expect(profileModeToGoogle("car")).toBe("driving");
    expect(profileModeToGoogle("transit")).toBe("transit");
    expect(profileModeToGoogle("bike")).toBe("bicycling");
    expect(profileModeToGoogle("walk")).toBe("walking");
    expect(profileModeToGoogle("any")).toBe("driving");
    expect(profileModeToGoogle(null)).toBe("driving");
  });
});

describe("commute.fetchCommuteEstimate", () => {
  beforeEach(() => {
    _resetCommuteCache();
    delete process.env.GOOGLE_MAPS_API_KEY;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalKey) process.env.GOOGLE_MAPS_API_KEY = originalKey;
    vi.restoreAllMocks();
  });

  const a = { lat: 51.5, lng: -0.12 };
  const b = { lat: 51.6, lng: -0.05 };

  it("returns null when API key is missing", async () => {
    const out = await fetchCommuteEstimate(a, b, "driving");
    expect(out).toBeNull();
  });

  it("returns null when coordinates are invalid", async () => {
    const out = await fetchCommuteEstimate(
      { lat: Number.NaN, lng: 0 },
      b,
      "driving",
      { apiKeyOverride: "test-key" },
    );
    expect(out).toBeNull();
  });

  it("returns null when Google says ZERO_RESULTS at the row level", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          status: "OK",
          rows: [{ elements: [{ status: "ZERO_RESULTS" }] }],
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;
    const out = await fetchCommuteEstimate(a, b, "driving", {
      apiKeyOverride: "test-key",
    });
    expect(out).toBeNull();
  });

  it("returns null when Google's top-level status isn't OK", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ status: "REQUEST_DENIED", rows: [] }), {
        status: 200,
      }),
    ) as unknown as typeof fetch;
    const out = await fetchCommuteEstimate(a, b, "driving", {
      apiKeyOverride: "test-key",
    });
    expect(out).toBeNull();
  });

  it("parses a successful response into a CommuteEstimate", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          status: "OK",
          rows: [
            {
              elements: [
                {
                  status: "OK",
                  duration: { value: 1800, text: "30 mins" }, // 30 min
                  distance: { value: 15_000, text: "15 km" }, // 15 km
                },
              ],
            },
          ],
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;
    const out = await fetchCommuteEstimate(a, b, "driving", {
      apiKeyOverride: "test-key",
    });
    expect(out).not.toBeNull();
    expect(out?.durationMinutes).toBe(30);
    expect(out?.distanceKm).toBe(15);
    expect(out?.mode).toBe("driving");
    // 15 km × 2 trips × 22 days × $0.60 = $396
    expect(out?.costEstimateUsd).toBe(396);
  });

  it("caches successive identical calls", async () => {
    const spy = vi.fn(async () =>
      new Response(
        JSON.stringify({
          status: "OK",
          rows: [
            {
              elements: [
                {
                  status: "OK",
                  duration: { value: 600, text: "10 mins" },
                  distance: { value: 5_000, text: "5 km" },
                },
              ],
            },
          ],
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;
    globalThis.fetch = spy;
    const r1 = await fetchCommuteEstimate(a, b, "driving", {
      apiKeyOverride: "test-key",
    });
    const r2 = await fetchCommuteEstimate(a, b, "driving", {
      apiKeyOverride: "test-key",
    });
    expect(r1?.durationMinutes).toBe(10);
    expect(r2?.durationMinutes).toBe(10);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
