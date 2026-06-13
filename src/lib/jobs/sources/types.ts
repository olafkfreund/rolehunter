// JobSource adapter framework — common interface every source implements.
// See doc/plans/2026-05-31-rolehunter-v3-design.md §5.

export type JobSourceId =
  | "paste"
  | "jsearch"
  | "linkedin"
  | "adzuna"
  | "indeed"
  | "dice"
  | "jobspy"
  | "apify"
  | "greenhouse"
  | "lever"
  | "workday"
  | "glassdoor"
  | "reed"
  | "workable"
  | "ashby"
  | "smartrecruiters";

export type RemoteMode = "remote" | "hybrid" | "onsite";
export type SalaryPeriod = "year" | "month" | "hour";

export interface SearchParams {
  query: string;
  location?: string;
  locationRadiusKm?: number;
  salaryMinUsd?: number;
  salaryMaxUsd?: number;
  remoteModes?: RemoteMode[];
  experienceLevels?: string[];
  jobTypes?: string[];
  maxResults: number;
  countryHint?: string;
  /**
   * ATS-source specific: which company boards to fetch.
   * - Greenhouse / Lever: company slug (`"stripe"`)
   * - Workday: `"tenant/site"` (e.g. `"stripe/External"`)
   * Ignored by query-based adapters (jsearch, linkedin, adzuna, etc).
   */
  targetCompanies?: string[];
}

export interface RawSalary {
  min?: number;
  max?: number;
  currency: string;
  period?: SalaryPeriod;
}

export interface RawLocation {
  city?: string;
  region?: string;
  country?: string;
  raw?: string;
}

export interface RawJob {
  externalId: string;
  title: string;
  company: string;
  companyUrl?: string;
  location?: RawLocation;
  remoteMode?: RemoteMode;
  description: string;
  salary?: RawSalary;
  jobType?: string;
  experienceLevel?: string;
  postedAt?: string;
  url: string;
  rawSource: unknown;
}

export interface SourceSighting {
  source: JobSourceId;
  externalId: string;
  url: string;
  fetchedAt: string;
}

export type AvailabilityResult = { ok: true } | { ok: false; reason: string };

export interface JobSource {
  id: JobSourceId;
  displayName: string;
  available(): Promise<AvailabilityResult>;
  costEstimate(params: SearchParams): number;
  search(params: SearchParams, signal: AbortSignal): Promise<RawJob[]>;
}
