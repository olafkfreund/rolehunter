import type { LinkedInJob } from "./client";

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function firstString(...values: unknown[]): string | undefined {
  for (const v of values) {
    if (typeof v === "string" && v.length > 0) return v;
    if (typeof v === "number" || typeof v === "bigint") return String(v);
  }
  return undefined;
}

function firstNumber(...values: unknown[]): number | undefined {
  for (const v of values) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "") {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

function extractLocation(raw: Record<string, unknown>): string {
  const loc = raw["location"];
  if (typeof loc === "string" && loc.length > 0) return loc;

  const locObj = asRecord(loc);
  if (locObj) {
    const parts: string[] = [];
    const city = locObj["city"];
    const country = locObj["country"];
    if (typeof city === "string" && city.length > 0) parts.push(city);
    if (typeof country === "string" && country.length > 0) parts.push(country);
    if (parts.length > 0) return parts.join(", ");
  }

  // Fantastic Jobs: `locations_raw` is typically an array of Place objects with
  // `address` containing `addressLocality`, `addressRegion`, `addressCountry`.
  const locsRaw = raw["locations_raw"];
  if (Array.isArray(locsRaw) && locsRaw.length > 0) {
    for (const entry of locsRaw) {
      const entryRec = asRecord(entry);
      if (!entryRec) continue;
      const addr = asRecord(entryRec["address"]) ?? entryRec;
      const parts: string[] = [];
      const city = firstString(addr["addressLocality"], addr["city"]);
      const region = firstString(addr["addressRegion"], addr["region"]);
      const country = firstString(addr["addressCountry"], addr["country"]);
      if (city) parts.push(city);
      if (region && region !== city) parts.push(region);
      if (country) parts.push(country);
      if (parts.length > 0) return parts.join(", ");
    }
  }

  const jobLocation = raw["job_location"];
  if (typeof jobLocation === "string" && jobLocation.length > 0) return jobLocation;

  return "";
}

function extractListedAt(raw: Record<string, unknown>): string | undefined {
  const candidate = firstString(
    raw["listed_at"],
    raw["posted_at"],
    raw["date_posted"],
    raw["date_created"],
    raw["job_posted_at_datetime_utc"],
  );
  if (!candidate) return undefined;
  try {
    const d = new Date(candidate);
    if (Number.isNaN(d.getTime())) return undefined;
    return d.toISOString();
  } catch {
    return undefined;
  }
}

function extractSalary(raw: Record<string, unknown>): {
  min?: number;
  max?: number;
  currency?: string;
} {
  const salaryObj = asRecord(raw["salary"]);
  // Fantastic Jobs exposes `salary_raw`, typically a schema.org MonetaryAmount.
  const salaryRaw = asRecord(raw["salary_raw"]);
  const valueObj = asRecord(salaryRaw?.["value"]);

  const min = firstNumber(
    raw["salary_min"],
    salaryObj?.["min"],
    raw["job_min_salary"],
    valueObj?.["minValue"],
  );
  const max = firstNumber(
    raw["salary_max"],
    salaryObj?.["max"],
    raw["job_max_salary"],
    valueObj?.["maxValue"],
  );
  const currency = firstString(
    raw["salary_currency"],
    salaryObj?.["currency"],
    raw["job_salary_currency"],
    salaryRaw?.["currency"],
  );

  return {
    min,
    max,
    currency,
  };
}

function extractIsRemote(raw: Record<string, unknown>): boolean | undefined {
  if (raw["is_remote"] === true || raw["remote_derived"] === true) return true;
  if (raw["remote"] === true) return true;
  if (typeof raw["workplace_type"] === "string" && raw["workplace_type"] === "Remote") return true;
  if (typeof raw["location_type"] === "string" && /remote/i.test(raw["location_type"] as string)) return true;
  if (raw["is_remote"] === false || raw["remote"] === false) return false;
  return undefined;
}

export function normalizeLinkedInRow(raw: unknown): LinkedInJob {
  const rec = asRecord(raw);
  if (!rec) {
    throw new Error("Invalid LinkedIn row: expected object");
  }

  const id = firstString(rec["id"], rec["job_id"], rec["linkedin_job_id"]);
  const title = firstString(rec["title"], rec["job_title"], rec["name"]);

  const companyRec = asRecord(rec["company"]);
  const company = firstString(
    companyRec?.["name"],
    rec["company_name"],
    rec["employer_name"],
    rec["organization"],
    typeof rec["company"] === "string" ? rec["company"] : undefined,
  );

  if (!id) throw new Error("LinkedIn row missing id");
  if (!title) throw new Error("LinkedIn row missing title");
  if (!company) throw new Error("LinkedIn row missing company");

  const url = firstString(
    rec["url"],
    rec["apply_link"],
    rec["job_apply_link"],
    rec["job_url"],
  );
  const description = firstString(rec["description"], rec["job_description"]);
  const listedAt = extractListedAt(rec);
  const { min: salaryMin, max: salaryMax, currency: salaryCurrency } = extractSalary(rec);
  const isRemote = extractIsRemote(rec);

  return {
    id,
    title,
    company,
    location: extractLocation(rec),
    url,
    description,
    listedAt,
    salaryMin,
    salaryMax,
    salaryCurrency,
    isRemote,
    raw,
  };
}
