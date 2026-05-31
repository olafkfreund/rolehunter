// Currency conversion via Frankfurter (free, no key, ECB-sourced).
// https://api.frankfurter.dev — generous rate limits, 70+ currencies.
//
// In-memory cache keyed by "FROM" with a 12h TTL. ECB rates barely move
// intraday; single-user self-hosted doesn't need anything fancier.

interface RatesPayload {
  amount: number;
  base: string;
  date: string; // YYYY-MM-DD
  rates: Record<string, number>;
}

interface CacheEntry {
  fetchedAt: number;
  payload: RatesPayload;
}

const TTL_MS = 12 * 60 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

export const SUPPORTED_BASES = new Set([
  "AUD", "BGN", "BRL", "CAD", "CHF", "CNY", "CZK", "DKK", "EUR", "GBP",
  "HKD", "HUF", "IDR", "ILS", "INR", "ISK", "JPY", "KRW", "MXN", "MYR",
  "NOK", "NZD", "PHP", "PLN", "RON", "SEK", "SGD", "THB", "TRY", "USD",
  "ZAR",
]);

export interface ConversionResult {
  amount: number;
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  asOf: string;
}

function norm(code: string): string {
  return code.trim().toUpperCase();
}

async function fetchRatesFor(base: string): Promise<RatesPayload | null> {
  const cached = cache.get(base);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return cached.payload;
  }
  const url = `https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(base)}`;
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "rolehunter/3.2 (+https://github.com/olafkfreund/rolehunter; olaf@freundcloud.com)",
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const payload = (await res.json()) as RatesPayload;
    if (!payload?.rates || typeof payload.rates !== "object") return null;
    cache.set(base, { fetchedAt: Date.now(), payload });
    return payload;
  } catch {
    return null;
  }
}

/**
 * Convert an amount from one currency to another. Returns null if either
 * currency is unsupported or the network call fails. Same-currency returns
 * a unit-rate conversion immediately without any HTTP call.
 *
 * Public so callers can show "converted via ECB rate as of X" in evidence
 * rows. Caching is automatic; consumers don't need to memoize.
 */
export async function convertCurrency(
  amount: number,
  from: string,
  to: string,
): Promise<ConversionResult | null> {
  const f = norm(from);
  const t = norm(to);
  if (!f || !t) return null;
  if (!SUPPORTED_BASES.has(f) || !SUPPORTED_BASES.has(t)) return null;
  if (!Number.isFinite(amount)) return null;
  if (f === t) {
    return {
      amount,
      fromCurrency: f,
      toCurrency: t,
      rate: 1,
      asOf: new Date().toISOString().slice(0, 10),
    };
  }
  const payload = await fetchRatesFor(f);
  if (!payload) return null;
  const rate = payload.rates[t];
  if (typeof rate !== "number" || !Number.isFinite(rate)) return null;
  return {
    amount: amount * rate,
    fromCurrency: f,
    toCurrency: t,
    rate,
    asOf: payload.date,
  };
}

/** Visible for testing. */
export function _resetFxCache(): void {
  cache.clear();
}
