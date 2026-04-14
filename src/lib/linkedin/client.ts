import { getEnv } from "@/lib/env";
import { normalizeLinkedInRow } from "./normalize";

export interface LinkedInSearchOpts {
  location?: string;
  limit?: number;
  offset?: number;
}

export interface LinkedInJob {
  id: string;
  title: string;
  company: string;
  location: string;
  url?: string;
  description?: string;
  listedAt?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  isRemote?: boolean;
  raw: unknown;
}

export interface LinkedInResult {
  quota: { remaining: number | null };
  data: LinkedInJob[];
}

const REQUEST_TIMEOUT_MS = 30_000;

function getHost(): string {
  return getEnv().LINKEDIN_RAPIDAPI_HOST;
}

function getKey(): string {
  const env = getEnv();
  if (!env.JSEARCH_RAPIDAPI_KEY) {
    throw new Error(
      "JSEARCH_RAPIDAPI_KEY is not configured. Set it in your environment to enable LinkedIn search.",
    );
  }
  return env.JSEARCH_RAPIDAPI_KEY;
}

function readRemaining(headers: Headers): number | null {
  for (const name of [
    "x-ratelimit-requests-remaining",
    "X-RateLimit-Requests-Remaining",
    "X-Ratelimit-Requests-Remaining",
  ]) {
    const v = headers.get(name);
    if (v != null) {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }
  }
  return null;
}

async function linkedInFetch(path: string, params: URLSearchParams): Promise<Response> {
  const host = getHost();
  const key = getKey();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`https://${host}${path}?${params.toString()}`, {
      method: "GET",
      headers: {
        "X-RapidAPI-Key": key,
        "X-RapidAPI-Host": host,
      },
      cache: "no-store",
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

function extractRows(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  if (json && typeof json === "object") {
    const obj = json as Record<string, unknown>;
    if (Array.isArray(obj.data)) return obj.data;
    if (Array.isArray(obj.jobs)) return obj.jobs;
  }
  return [];
}

function extractSingle(json: unknown): unknown {
  if (json && typeof json === "object") {
    const obj = json as Record<string, unknown>;
    if (obj.data && typeof obj.data === "object" && !Array.isArray(obj.data)) {
      return obj.data;
    }
  }
  return json;
}

export async function searchJobs(
  query: string,
  opts: LinkedInSearchOpts = {},
): Promise<LinkedInResult> {
  const params = new URLSearchParams({
    title_filter: query,
    limit: String(opts.limit ?? 20),
    offset: String(opts.offset ?? 0),
  });
  if (opts.location) params.set("location_filter", opts.location);

  const res = await linkedInFetch("/active-jb-7d", params);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `LinkedIn request failed (${res.status}): ${text || res.statusText}`,
    );
  }

  const remaining = readRemaining(res.headers);
  const json = (await res.json()) as unknown;
  const rows = extractRows(json);

  const data: LinkedInJob[] = [];
  for (const row of rows) {
    try {
      data.push(normalizeLinkedInRow(row));
    } catch {
      // Skip rows missing required fields.
    }
  }

  return {
    quota: { remaining },
    data,
  };
}

export async function getJobDetail(externalId: string): Promise<LinkedInJob> {
  const params = new URLSearchParams({ id: externalId });
  const res = await linkedInFetch("/job-detail", params);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `LinkedIn detail request failed (${res.status}): ${text || res.statusText}`,
    );
  }

  const json = (await res.json()) as unknown;
  const row = extractSingle(json);
  return normalizeLinkedInRow(row);
}
