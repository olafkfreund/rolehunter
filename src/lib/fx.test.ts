import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetFxCache, convertCurrency, SUPPORTED_BASES } from "./fx";

const originalFetch = globalThis.fetch;

describe("fx.convertCurrency", () => {
  beforeEach(() => {
    _resetFxCache();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns unit conversion for same-currency calls without hitting network", async () => {
    const spy = vi.fn();
    globalThis.fetch = spy as unknown as typeof fetch;
    const r = await convertCurrency(123.45, "USD", "USD");
    expect(r).not.toBeNull();
    expect(r?.amount).toBe(123.45);
    expect(r?.rate).toBe(1);
    expect(r?.fromCurrency).toBe("USD");
    expect(r?.toCurrency).toBe("USD");
    expect(spy).not.toHaveBeenCalled();
  });

  it("returns null when the source currency is not supported", async () => {
    const r = await convertCurrency(100, "XYZ", "USD");
    expect(r).toBeNull();
  });

  it("returns null when the target currency is not supported", async () => {
    const r = await convertCurrency(100, "USD", "XYZ");
    expect(r).toBeNull();
  });

  it("returns null when amount is NaN", async () => {
    const r = await convertCurrency(Number.NaN, "USD", "EUR");
    expect(r).toBeNull();
  });

  it("converts via the Frankfurter rate when both currencies are supported", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          amount: 1,
          base: "USD",
          date: "2026-05-31",
          rates: { GBP: 0.79, EUR: 0.92 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    ) as unknown as typeof fetch;
    const r = await convertCurrency(100, "USD", "GBP");
    expect(r).not.toBeNull();
    expect(r?.rate).toBe(0.79);
    expect(r?.amount).toBeCloseTo(79, 5);
    expect(r?.asOf).toBe("2026-05-31");
  });

  it("uppercases lowercase currency codes before checking support", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          amount: 1,
          base: "USD",
          date: "2026-05-31",
          rates: { EUR: 0.92 },
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;
    const r = await convertCurrency(100, "usd", "eur");
    expect(r?.fromCurrency).toBe("USD");
    expect(r?.toCurrency).toBe("EUR");
  });

  it("returns null when the rates payload is missing the requested target", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          amount: 1,
          base: "USD",
          date: "2026-05-31",
          rates: { EUR: 0.92 },
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;
    const r = await convertCurrency(100, "USD", "GBP");
    expect(r).toBeNull();
  });

  it("returns null when the network call fails", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const r = await convertCurrency(100, "USD", "GBP");
    expect(r).toBeNull();
  });

  it("caches successive calls within the same base", async () => {
    const spy = vi.fn(async () =>
      new Response(
        JSON.stringify({
          amount: 1,
          base: "USD",
          date: "2026-05-31",
          rates: { GBP: 0.79, EUR: 0.92, JPY: 156 },
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;
    globalThis.fetch = spy;
    const a = await convertCurrency(100, "USD", "GBP");
    const b = await convertCurrency(100, "USD", "EUR");
    const c = await convertCurrency(100, "USD", "JPY");
    expect(a?.amount).toBeCloseTo(79, 5);
    expect(b?.amount).toBeCloseTo(92, 5);
    expect(c?.amount).toBeCloseTo(15_600, 0);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("fx.SUPPORTED_BASES", () => {
  it("contains the major currencies users will use", () => {
    for (const c of ["USD", "EUR", "GBP", "JPY", "AUD", "CAD"]) {
      expect(SUPPORTED_BASES.has(c)).toBe(true);
    }
  });
  it("rejects obviously bogus codes", () => {
    expect(SUPPORTED_BASES.has("XYZ")).toBe(false);
  });
});
