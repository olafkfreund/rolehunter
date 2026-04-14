import { getEnv } from "@/lib/env";

export type JSearchJob = {
  job_id: string;
  job_title: string;
  employer_name: string | null;
  job_city: string | null;
  job_country: string | null;
  job_description: string | null;
  job_apply_link: string | null;
  job_posted_at_datetime_utc: string | null;
  job_min_salary: number | null;
  job_max_salary: number | null;
  job_salary_currency: string | null;
  [key: string]: unknown;
};

export type JSearchDatePosted = "all" | "today" | "3days" | "week" | "month";

export type JSearchResult = {
  quota: { remaining: number | null };
  data: JSearchJob[];
};

export type SearchOptions = {
  page?: number;
  num_pages?: number;
  date_posted?: JSearchDatePosted;
};

const JSEARCH_HOST = "jsearch.p.rapidapi.com";
const JSEARCH_URL = `https://${JSEARCH_HOST}/search`;

export async function searchJobs(
  query: string,
  opts: SearchOptions = {},
): Promise<JSearchResult> {
  const env = getEnv();
  if (!env.JSEARCH_RAPIDAPI_KEY) {
    throw new Error(
      "JSEARCH_RAPIDAPI_KEY is not configured. Set it in your environment to enable JSearch.",
    );
  }

  const params = new URLSearchParams({
    query,
    page: String(opts.page ?? 1),
    num_pages: String(opts.num_pages ?? 1),
    date_posted: opts.date_posted ?? "all",
  });

  const res = await fetch(`${JSEARCH_URL}?${params.toString()}`, {
    method: "GET",
    headers: {
      "X-RapidAPI-Key": env.JSEARCH_RAPIDAPI_KEY,
      "X-RapidAPI-Host": JSEARCH_HOST,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`JSearch request failed (${res.status}): ${text || res.statusText}`);
  }

  const remainingHeader =
    res.headers.get("x-ratelimit-requests-remaining") ??
    res.headers.get("X-RateLimit-Requests-Remaining");
  const remaining = remainingHeader ? Number(remainingHeader) : null;

  const json = (await res.json()) as { data?: JSearchJob[] };
  return {
    quota: { remaining: Number.isFinite(remaining) ? remaining : null },
    data: Array.isArray(json.data) ? json.data : [],
  };
}
