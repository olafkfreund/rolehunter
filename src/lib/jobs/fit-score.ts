// Local multi-dimensional fit scoring. Five dimensions, each 0-100 with a
// band (top/stretch/pass) for the UI grid colour. No LLM call — all signals
// come from the JD text + CV + profile + (optional) cached company record.
//
// LLM-powered match() output stays the source of truth for the existing
// MatchPanel; this dashboard sits above it as the fast-glance overview.

import type { Company, JobListing, Profile } from "@/lib/db/schema";
import type { CvJson } from "@/lib/llm";
import { classifyJobSkills, type ClassifyResult } from "./skill-classify";
import { loadPortfolioSkillContext } from "./portfolio-skills";
import { getSkillOverrides } from "@/lib/repo/skill-overrides";
import { convertCurrency, SUPPORTED_BASES } from "@/lib/fx";
import { resolveWorkLocation } from "@/lib/companies/work-location";
import type { OfficePickResult } from "@/lib/companies/pick-office";
import {
  fetchCommuteEstimate,
  profileModeToGoogle,
  type CommuteEstimate,
} from "@/lib/companies/commute";

export type Band = "top" | "stretch" | "pass" | "n/a";

export interface FitDimension {
  key: string;
  label: string;
  score: number; // 0-100, or -1 if not applicable
  band: Band;
  evidence: string[]; // short bullet points the UI renders under the score
}

export interface FitReport {
  skills: ClassifyResult;
  dimensions: FitDimension[];
  overall: { score: number; band: Band };
}

function bandFor(score: number): Band {
  if (score < 0) return "n/a";
  if (score >= 70) return "top";
  if (score >= 50) return "stretch";
  return "pass";
}

// ─────────────────────────────────────────────────────────────────────────
// Dimension scorers
// ─────────────────────────────────────────────────────────────────────────

function scoreSkills(skills: ClassifyResult): FitDimension {
  const evidence: string[] = [];
  if (skills.jobTokens.length === 0) {
    evidence.push("No technical skills detected in the JD — short or non-tech role.");
  } else {
    evidence.push(
      `${skills.matchedCount} matched · ${skills.partialCount} partial · ${skills.missingCount} missing`,
    );
    const missing = skills.classified
      .filter((c) => c.class === "missing")
      .slice(0, 4)
      .map((c) => c.token);
    if (missing.length > 0) evidence.push(`gaps: ${missing.join(", ")}`);
  }
  return {
    key: "skills",
    label: "Skills & tech",
    score: skills.jobTokens.length === 0 ? -1 : skills.coveragePct,
    band: skills.jobTokens.length === 0 ? "n/a" : bandFor(skills.coveragePct),
    evidence,
  };
}

// JD seniority cues vs CV's stated years-of-experience and role keywords.
const SENIORITY_PATTERNS: Array<{ level: number; label: string; rx: RegExp }> = [
  { level: 1, label: "intern", rx: /\b(intern|graduate scheme|trainee)\b/i },
  { level: 2, label: "junior", rx: /\b(junior|jr\.?|entry[- ]level|associate)\b/i },
  { level: 3, label: "mid", rx: /\b(mid[- ]level|mid\b|software engineer ii)\b/i },
  { level: 4, label: "senior", rx: /\b(senior|sr\.?|sde[- ]?iii?)\b/i },
  { level: 5, label: "staff/principal", rx: /\b(staff|principal|lead\b|architect)\b/i },
  { level: 6, label: "director+", rx: /\b(director|vp\b|chief|head of)\b/i },
];

function detectJdSeniority(title: string, description: string): {
  level: number;
  label: string;
} | null {
  const text = `${title}\n${description.slice(0, 4_000)}`;
  // Highest matching tier wins (most specific)
  for (let i = SENIORITY_PATTERNS.length - 1; i >= 0; i--) {
    const p = SENIORITY_PATTERNS[i];
    if (p.rx.test(text)) return { level: p.level, label: p.label };
  }
  return null;
}

function inferCvSeniority(cv: CvJson | null): { level: number; yoe: number } | null {
  if (!cv?.experience || cv.experience.length === 0) return null;
  // Total YOE: sum across experience entries with a parseable start year.
  const now = new Date().getFullYear();
  let yoe = 0;
  for (const e of cv.experience) {
    if (!e.start) continue;
    const startYear = parseInt(e.start.slice(0, 4), 10);
    if (!Number.isFinite(startYear)) continue;
    const endYear =
      e.end && /^\d{4}/.test(e.end)
        ? parseInt(e.end.slice(0, 4), 10)
        : now;
    yoe += Math.max(0, endYear - startYear);
  }
  let level: number;
  if (yoe >= 12) level = 6;
  else if (yoe >= 8) level = 5;
  else if (yoe >= 4) level = 4;
  else if (yoe >= 2) level = 3;
  else if (yoe >= 1) level = 2;
  else level = 1;
  return { level, yoe };
}

function scoreExperience(job: JobListing, cv: CvJson | null): FitDimension {
  const jdSeniority = detectJdSeniority(job.title, job.description);
  const cvSeniority = inferCvSeniority(cv);
  const evidence: string[] = [];
  if (!jdSeniority || !cvSeniority) {
    if (!jdSeniority) evidence.push("JD seniority not detected from title/description.");
    if (!cvSeniority) evidence.push("CV experience not parseable — fill in /profile + /cv.");
    return { key: "experience", label: "Experience", score: -1, band: "n/a", evidence };
  }
  // Score: 100 if exact, drops 20 per level of mismatch in either direction.
  const diff = Math.abs(jdSeniority.level - cvSeniority.level);
  const score = Math.max(0, 100 - diff * 20);
  evidence.push(`JD reads ${jdSeniority.label}; CV ≈ ${cvSeniority.yoe} years experience`);
  if (cvSeniority.level > jdSeniority.level) {
    evidence.push("you may be over-qualified — risk of low-balled comp");
  } else if (cvSeniority.level < jdSeniority.level) {
    evidence.push("you may be under-qualified — stretch role");
  }
  return {
    key: "experience",
    label: "Experience",
    score,
    band: bandFor(score),
    evidence,
  };
}

// Culture cue vocabulary lives in its own module so client components
// (profile-form.tsx) can import it without pulling in this file's DB-heavy
// transitive imports. Re-exported here for backwards compatibility.
export { CULTURE_KEYWORDS, CULTURE_KEYS } from "./culture-keywords";
import { CULTURE_KEYWORDS } from "./culture-keywords";

function detectCultureCues(jd: string): string[] {
  const found: string[] = [];
  for (const c of CULTURE_KEYWORDS) {
    if (c.rx.test(jd)) found.push(c.key);
  }
  return found;
}

function detectWorkMode(jd: string): "remote" | "hybrid" | "onsite" | "unknown" {
  if (/\b(remote[- ]first|fully remote|100% remote|wfh)\b/i.test(jd)) return "remote";
  if (/\bhybrid\b/i.test(jd)) return "hybrid";
  if (/\b(on[- ]site|onsite|in[- ]office)\b/i.test(jd)) return "onsite";
  return "unknown";
}

function scoreCulture(job: JobListing, profile: Profile | null): FitDimension {
  const fullText = `${job.title}\n${job.description}\n${job.location ?? ""}`;
  const detected = detectCultureCues(fullText);
  const evidence: string[] = [];

  const likes = ((profile?.cultureLikes as unknown as string[]) ?? []).filter(
    (v) => typeof v === "string",
  );
  const avoids = ((profile?.cultureAvoids as unknown as string[]) ?? []).filter(
    (v) => typeof v === "string",
  );
  const workPref = profile?.workModePreference ?? "any";
  const hasPrefs = likes.length > 0 || avoids.length > 0 || (workPref && workPref !== "any");

  if (!hasPrefs) {
    // No user prefs → keep the old "detected" heuristic. 60 baseline; positive
    // cues lift, default-negative cues drag.
    const positive = detected.filter(
      (k) => CULTURE_KEYWORDS.find((c) => c.key === k)?.positive,
    );
    const caution = detected.filter(
      (k) => !CULTURE_KEYWORDS.find((c) => c.key === k)?.positive,
    );
    if (positive.length > 0) evidence.push(`detected: ${positive.join(", ")}`);
    if (caution.length > 0) evidence.push(`watch for: ${caution.join(", ")}`);
    if (detected.length === 0)
      evidence.push("No culture cues detected — set preferences in /profile to score.");
    if (detected.length === 0)
      return { key: "culture", label: "Culture cues", score: -1, band: "n/a", evidence };
    const raw = 60 + positive.length * 10 - caution.length * 8;
    const score = Math.max(0, Math.min(100, raw));
    return { key: "culture", label: "Culture cues", score, band: bandFor(score), evidence };
  }

  // User has expressed preferences. Score against them.
  const matchedLikes = detected.filter((k) => likes.includes(k));
  const triggeredAvoids = detected.filter((k) => avoids.includes(k));
  const neutralCues = detected.filter(
    (k) => !likes.includes(k) && !avoids.includes(k),
  );

  let score = 60;
  score += matchedLikes.length * 12;
  score -= triggeredAvoids.length * 15;
  // Neutral cues nudge using the default positive/negative lean, lightly.
  for (const k of neutralCues) {
    const def = CULTURE_KEYWORDS.find((c) => c.key === k);
    if (def) score += def.positive ? 3 : -3;
  }

  // Work-mode penalty (capped).
  let workCap: number | null = null;
  if (workPref && workPref !== "any" && workPref !== "unknown") {
    const jdMode = detectWorkMode(fullText);
    if (jdMode !== "unknown" && jdMode !== workPref) {
      // Hard mismatch: remote-only user looking at onsite-only role.
      if (
        (workPref === "remote" && jdMode === "onsite") ||
        (workPref === "onsite" && jdMode === "remote")
      ) {
        workCap = 25;
        evidence.push(`work-mode mismatch — you prefer ${workPref}, JD is ${jdMode} (capped 25)`);
      } else {
        // Softer mismatch (hybrid <-> remote/onsite).
        score -= 15;
        evidence.push(`work-mode mismatch — you prefer ${workPref}, JD is ${jdMode} (-15)`);
      }
    }
  }

  if (matchedLikes.length > 0)
    evidence.push(`✓ matches: ${matchedLikes.map(prettyCueKey).join(", ")}`);
  if (triggeredAvoids.length > 0)
    evidence.push(`✗ triggers avoids: ${triggeredAvoids.map(prettyCueKey).join(", ")}`);
  if (matchedLikes.length === 0 && triggeredAvoids.length === 0 && neutralCues.length === 0) {
    evidence.push("No culture cues detected in this JD against your preferences.");
  }

  score = Math.max(0, Math.min(100, score));
  if (workCap !== null) score = Math.min(score, workCap);

  return { key: "culture", label: "Culture cues", score, band: bandFor(score), evidence };
}

function prettyCueKey(k: string): string {
  return CULTURE_KEYWORDS.find((c) => c.key === k)?.label ?? k;
}

// Normalise a band to annual-equivalent using rough single-earner heuristics.
// We document the conversion in the evidence so the user knows it's approximate.
const HOURS_PER_DAY = 8;
const DAYS_PER_MONTH = 22;
const MONTHS_PER_YEAR = 12;

function toAnnual(amount: number, period: string): number {
  switch (period) {
    case "hourly":
      return amount * HOURS_PER_DAY * DAYS_PER_MONTH * MONTHS_PER_YEAR;
    case "daily":
      return amount * DAYS_PER_MONTH * MONTHS_PER_YEAR;
    case "monthly":
      return amount * MONTHS_PER_YEAR;
    case "annual":
    default:
      return amount;
  }
}

// Infer the period of a JD-posted band from the magnitude when the JD doesn't
// say explicitly. e.g. an hourly contractor rate vs an annual salary.
function inferPeriodFromAmount(maxAmount: number): string {
  if (maxAmount < 500) return "hourly";
  if (maxAmount < 5_000) return "daily";
  if (maxAmount < 30_000) return "monthly";
  return "annual";
}

async function scoreCompensation(
  job: JobListing,
  profile: Profile | null,
): Promise<FitDimension> {
  const evidence: string[] = [];

  if (!job.salaryMin && !job.salaryMax) {
    evidence.push("No salary band in JD — request transparency before applying.");
    return { key: "comp", label: "Compensation", score: -1, band: "n/a", evidence };
  }

  const jdLo = job.salaryMin ?? job.salaryMax ?? 0;
  const jdHi = job.salaryMax ?? job.salaryMin ?? 0;
  const jdCur = (job.salaryCurrency ?? "").toUpperCase();

  // Surface the raw JD band first — useful info even without scoring.
  evidence.push(
    `JD posts ${jdCur} ${jdLo.toLocaleString()}${jdHi !== jdLo ? "–" + jdHi.toLocaleString() : ""}`,
  );

  const tMin = profile?.salaryTargetMin;
  const tMax = profile?.salaryTargetMax;
  if (tMin == null && tMax == null) {
    evidence.push("Set your target band in /profile to score this dimension.");
    return { key: "comp", label: "Compensation", score: -1, band: "n/a", evidence };
  }

  const tCur = (profile?.salaryTargetCurrency ?? "").toUpperCase();

  // Normalise periods to annual-equivalent before any currency math.
  const targetPeriod = profile?.salaryTargetPeriod ?? "annual";
  const jdPeriod = inferPeriodFromAmount(jdHi);

  let jdLoAnnual = toAnnual(jdLo, jdPeriod);
  let jdHiAnnual = toAnnual(jdHi, jdPeriod);
  const targetLoAnnual = toAnnual(tMin ?? tMax ?? 0, targetPeriod);
  const targetHiAnnual = toAnnual(tMax ?? tMin ?? 0, targetPeriod);

  // FX conversion — if the JD and target currencies differ, convert JD into
  // target currency. Falls back to n/a with a clear evidence row if FX is
  // unavailable for either side.
  let displayCur = jdCur;
  if (tCur && jdCur && tCur !== jdCur) {
    if (!SUPPORTED_BASES.has(jdCur) || !SUPPORTED_BASES.has(tCur)) {
      evidence.push(
        `Currency mismatch — ${jdCur} or ${tCur} not in ECB rate set. Compare manually.`,
      );
      return { key: "comp", label: "Compensation", score: -1, band: "n/a", evidence };
    }
    const lo = await convertCurrency(jdLoAnnual, jdCur, tCur);
    const hi = await convertCurrency(jdHiAnnual, jdCur, tCur);
    if (!lo || !hi) {
      evidence.push(
        `Currency mismatch — JD ${jdCur} vs target ${tCur}. FX lookup failed; try again later.`,
      );
      return { key: "comp", label: "Compensation", score: -1, band: "n/a", evidence };
    }
    jdLoAnnual = lo.amount;
    jdHiAnnual = hi.amount;
    displayCur = tCur;
    evidence.push(
      `FX-converted to ${tCur} via ECB rate ${lo.rate.toFixed(4)} as of ${lo.asOf}: JD ≈ ${Math.round(jdLoAnnual).toLocaleString()}–${Math.round(jdHiAnnual).toLocaleString()} ${tCur}`,
    );
  } else if (jdPeriod !== "annual" || targetPeriod !== "annual") {
    evidence.push(
      `Normalised to annual: JD ≈ ${Math.round(jdLoAnnual).toLocaleString()}–${Math.round(jdHiAnnual).toLocaleString()} ${displayCur}, target ≈ ${Math.round(targetLoAnnual).toLocaleString()}–${Math.round(targetHiAnnual).toLocaleString()} ${tCur || jdCur}`,
    );
  }

  // Scoring (same bands as before):
  //   100 if JD floor >= target floor
  //    80 if JD ceiling >= target ceiling
  //    60 if mid-point of JD >= mid-point of target
  //    30 if JD ceiling within 25% gap below target floor
  //     0 otherwise
  let score: number;
  if (jdLoAnnual >= targetLoAnnual) {
    score = 100;
    evidence.push(`✓ JD floor meets or exceeds your target floor.`);
  } else if (jdHiAnnual >= targetHiAnnual) {
    score = 80;
    evidence.push(
      `Top end meets your target ceiling; floor is below your target — leverage in negotiation.`,
    );
  } else {
    const jdMid = (jdLoAnnual + jdHiAnnual) / 2;
    const targetMid = (targetLoAnnual + targetHiAnnual) / 2;
    if (jdMid >= targetMid) {
      score = 60;
      evidence.push("Midpoints match; full target requires top-of-band offer.");
    } else if (jdHiAnnual >= targetLoAnnual * 0.75) {
      score = 30;
      evidence.push("JD posts below your target. Possible only with hard negotiation.");
    } else {
      score = 0;
      evidence.push("JD is well below your target — likely not worth applying for comp.");
    }
  }

  return {
    key: "comp",
    label: "Compensation",
    score,
    band: bandFor(score),
    evidence,
  };
}

async function scoreLogistics(
  job: JobListing,
  company: Company | null,
  profile: Profile | null,
): Promise<FitDimension> {
  const evidence: string[] = [];
  const jd = `${job.title}\n${job.description.slice(0, 4_000)}\n${job.location ?? ""}`;
  const remoteFirst = /\b(remote[- ]first|fully remote|100% remote|wfh)\b/i.test(jd);
  const hybrid = /\bhybrid\b/i.test(jd);
  const onsiteOnly = !remoteFirst && /\b(on[- ]site|onsite|in[- ]office)\b/i.test(jd);

  if (remoteFirst) {
    evidence.push("Remote-first — no commute.");
    return { key: "logistics", label: "Logistics", score: 95, band: "top", evidence };
  }

  const haveHome = profile?.homeLat != null && profile?.homeLng != null;
  if (!haveHome) {
    evidence.push("Set your home address in /profile to score commute.");
    return { key: "logistics", label: "Logistics", score: -1, band: "n/a", evidence };
  }
  if (!company) {
    evidence.push("Company not enriched yet — click Enrich on the company panel.");
    return { key: "logistics", label: "Logistics", score: -1, band: "n/a", evidence };
  }

  // Resolve to the right work location: prefer a city-matched office over HQ
  // when one exists. Falls back to HQ. Surfaces which we used in evidence.
  let workLoc: OfficePickResult | null = null;
  try {
    workLoc = await resolveWorkLocation(company, profile);
  } catch {
    workLoc = null;
  }
  if (!workLoc) {
    evidence.push(
      "No usable work location — geocode the company HQ or add an office.",
    );
    return { key: "logistics", label: "Logistics", score: -1, band: "n/a", evidence };
  }

  // Note which location was chosen so the user understands the distance.
  if (workLoc.source === "office-match-by-token") {
    evidence.push(`Using ${workLoc.label} (matches your area).`);
  } else if (workLoc.source === "office-closest") {
    evidence.push(`Using ${workLoc.label}.`);
  } else if (company.hqLat != null && company.hqLng != null) {
    evidence.push(`Using ${workLoc.label} (no office in your area).`);
  }

  // Haversine fallback (inline; no helper dep loop)
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const a = { lat: profile!.homeLat!, lng: profile!.homeLng! };
  const b = { lat: workLoc.point.lat, lng: workLoc.point.lng };
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat));
  const km = 2 * R * Math.asin(Math.sqrt(h));

  // Real commute via Google Maps Distance Matrix when GOOGLE_MAPS_API_KEY is
  // set. Otherwise fall back to the haversine approximation with the same
  // banding as before.
  const mode = profileModeToGoogle(profile?.preferredTransportMode ?? "car");
  let commute: CommuteEstimate | null = null;
  try {
    commute = await fetchCommuteEstimate(a, b, mode);
  } catch {
    commute = null;
  }

  if (commute) {
    const mins = commute.durationMinutes;
    const cap = profile?.maxCommuteMinutes ?? null;
    let score: number;
    if (cap !== null && mins > cap) {
      score = 15; // hard cap blown
      evidence.push(
        `commute ${mins}min via ${mode} — over your ${cap}min cap (-)`,
      );
    } else if (mins <= 20) score = 95;
    else if (mins <= 40) score = 85;
    else if (mins <= 60) score = 70;
    else if (mins <= 90) score = 50;
    else if (mins <= 120) score = 30;
    else score = 15;

    if (cap === null || mins <= cap) {
      evidence.push(`commute ${mins}min via ${mode} · ${Math.round(commute.distanceKm)} km`);
    }
    if (commute.costEstimateUsd !== null) {
      evidence.push(
        `≈ $${commute.costEstimateUsd.toLocaleString()}/mo commute cost (rough, 22 working days)`,
      );
    }
    if (onsiteOnly) {
      score = Math.max(0, score - 10);
      evidence.push("Onsite — no remote flex");
    } else if (hybrid) {
      evidence.push("Hybrid — fewer days of this commute per week");
    }
    return { key: "logistics", label: "Logistics", score, band: bandFor(score), evidence };
  }

  // Haversine fallback path
  let score: number;
  if (km <= 10) score = 95;
  else if (km <= 30) score = 85;
  else if (km <= 80) score = 70;
  else if (km <= 200) score = 50;
  else if (km <= 1000) score = 25;
  else score = 10;
  if (onsiteOnly) score = Math.max(0, score - 10);
  evidence.push(
    `${Math.round(km).toLocaleString()} km from your home (straight-line; set GOOGLE_MAPS_API_KEY for real commute time + cost)`,
  );
  if (hybrid) evidence.push("Hybrid — fewer in-office days reduce commute drag");
  else if (onsiteOnly) evidence.push("Onsite — no remote flex");
  return { key: "logistics", label: "Logistics", score, band: bandFor(score), evidence };
}

// ─────────────────────────────────────────────────────────────────────────
// Top-level
// ─────────────────────────────────────────────────────────────────────────

export async function computeFitReport(
  job: JobListing,
  cv: CvJson | null,
  company: Company | null,
  profile: Profile | null,
): Promise<FitReport> {
  // Pull portfolio-derived skill evidence so JD tokens you don't have in
  // your CV's skills array but DO have a repo for still count as matched.
  let portfolioContext: Awaited<ReturnType<typeof loadPortfolioSkillContext>>;
  try {
    portfolioContext = await loadPortfolioSkillContext();
  } catch {
    portfolioContext = { contexts: [], projectCount: 0 };
  }
  // User-supplied skill overrides win over CV/portfolio resolution.
  let overrides: Awaited<ReturnType<typeof getSkillOverrides>>;
  try {
    overrides = await getSkillOverrides();
  } catch {
    overrides = { matched: [], missing: [] };
  }
  const skills = classifyJobSkills(
    job.description,
    cv?.skills,
    job.title,
    portfolioContext.contexts,
    overrides,
  );
  const dimensions: FitDimension[] = [
    scoreSkills(skills),
    scoreExperience(job, cv),
    scoreCulture(job, profile),
    await scoreCompensation(job, profile),
    await scoreLogistics(job, company, profile),
  ];

  // Overall: weighted average of dimensions that scored (score >= 0).
  // Skills + experience weigh more than culture / comp / logistics signals.
  const WEIGHTS: Record<string, number> = {
    skills: 3,
    experience: 2,
    culture: 1,
    comp: 1,
    logistics: 1,
  };
  let weightedSum = 0;
  let totalWeight = 0;
  for (const d of dimensions) {
    if (d.score < 0) continue;
    const w = WEIGHTS[d.key] ?? 1;
    weightedSum += d.score * w;
    totalWeight += w;
  }
  const overallScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : -1;
  return {
    skills,
    dimensions,
    overall: { score: overallScore, band: bandFor(overallScore) },
  };
}
