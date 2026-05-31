// Local multi-dimensional fit scoring. Five dimensions, each 0-100 with a
// band (top/stretch/pass) for the UI grid colour. No LLM call — all signals
// come from the JD text + CV + profile + (optional) cached company record.
//
// LLM-powered match() output stays the source of truth for the existing
// MatchPanel; this dashboard sits above it as the fast-glance overview.

import type { Company, JobListing, Profile } from "@/lib/db/schema";
import type { CvJson } from "@/lib/llm";
import { classifyJobSkills, type ClassifyResult } from "./skill-classify";

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

// Culture cues — keyword chips we surface as "detected"; we don't score
// against user preferences because the user hasn't told us their preferences
// yet (slice 9 of #43 adds /settings/company-prefs).
const CULTURE_KEYWORDS: Array<{ key: string; rx: RegExp; positive: boolean }> = [
  { key: "remote-first", rx: /\b(remote[- ]first|fully remote|100% remote)\b/i, positive: true },
  { key: "hybrid", rx: /\bhybrid\b/i, positive: true },
  { key: "in-office", rx: /\b(in[- ]office|on[- ]site|onsite)\b/i, positive: false },
  { key: "async", rx: /\basynchronous\b|\basync(?:[- ]first| communication)\b/i, positive: true },
  { key: "ownership", rx: /\b(ownership|own[- ]your|end[- ]to[- ]end ownership)\b/i, positive: true },
  { key: "fast-paced", rx: /\bfast[- ]paced\b/i, positive: false },
  { key: "ambiguity", rx: /\b(ambiguity|comfortable with ambiguity|loosely defined)\b/i, positive: false },
  { key: "scale", rx: /\b(at scale|massive scale|hyper[- ]scale)\b/i, positive: true },
  { key: "well-funded", rx: /\b(series [a-d]|recently funded|well[- ]funded)\b/i, positive: true },
  { key: "early-stage", rx: /\b(early stage|stealth|seed stage|pre[- ]product)\b/i, positive: false },
];

interface CultureDetection {
  positive: string[];
  caution: string[];
}

function detectCulture(jd: string): CultureDetection {
  const positive: string[] = [];
  const caution: string[] = [];
  for (const c of CULTURE_KEYWORDS) {
    if (c.rx.test(jd)) {
      (c.positive ? positive : caution).push(c.key);
    }
  }
  return { positive, caution };
}

function scoreCulture(job: JobListing): FitDimension {
  const cues = detectCulture(job.description);
  const total = cues.positive.length + cues.caution.length;
  const evidence: string[] = [];
  if (cues.positive.length > 0) evidence.push(`detected: ${cues.positive.join(", ")}`);
  if (cues.caution.length > 0) evidence.push(`watch for: ${cues.caution.join(", ")}`);
  if (total === 0) evidence.push("No culture cues detected — JD is generic.");
  // Score: 60 baseline + 10 per positive cue, -8 per caution.
  const raw = 60 + cues.positive.length * 10 - cues.caution.length * 8;
  const score = Math.max(0, Math.min(100, raw));
  return {
    key: "culture",
    label: "Culture cues",
    score: total === 0 ? -1 : score,
    band: total === 0 ? "n/a" : bandFor(score),
    evidence,
  };
}

function scoreCompensation(job: JobListing): FitDimension {
  const evidence: string[] = [];
  if (!job.salaryMin && !job.salaryMax) {
    evidence.push("No salary band in JD — request transparency before applying.");
    return { key: "comp", label: "Compensation", score: -1, band: "n/a", evidence };
  }
  const lo = job.salaryMin ?? 0;
  const hi = job.salaryMax ?? lo;
  const cur = job.salaryCurrency ?? "";
  evidence.push(
    `JD posts ${cur} ${lo.toLocaleString()}${hi !== lo ? "–" + hi.toLocaleString() : ""}`,
  );
  evidence.push("Profile target not yet captured — add it in /settings/comp (follow-up slice).");
  // Without a target band we can't score; return -1 so the dashboard renders "n/a"
  // but the evidence row still shows what the JD posted.
  return { key: "comp", label: "Compensation", score: -1, band: "n/a", evidence };
}

function scoreLogistics(
  job: JobListing,
  company: Company | null,
  profile: Profile | null,
): FitDimension {
  const evidence: string[] = [];
  // Detect remote/hybrid/onsite from the JD; if remote-first there's no commute concern.
  const jd = `${job.title}\n${job.description.slice(0, 4_000)}\n${job.location ?? ""}`;
  const remoteFirst = /\b(remote[- ]first|fully remote|100% remote|wfh)\b/i.test(jd);
  const hybrid = /\bhybrid\b/i.test(jd);
  const onsiteOnly = !remoteFirst && /\b(on[- ]site|onsite|in[- ]office)\b/i.test(jd);

  if (remoteFirst) {
    evidence.push("Remote-first — no commute.");
    return { key: "logistics", label: "Logistics", score: 95, band: "top", evidence };
  }

  // Need home + HQ coords to score commute
  const haveHome = profile?.homeLat != null && profile?.homeLng != null;
  const haveHq = company?.hqLat != null && company?.hqLng != null;
  if (!haveHome) {
    evidence.push("Set your home address in /profile to score commute.");
    return { key: "logistics", label: "Logistics", score: -1, band: "n/a", evidence };
  }
  if (!haveHq) {
    evidence.push("Company HQ not yet geocoded — click Enrich on the company panel.");
    return { key: "logistics", label: "Logistics", score: -1, band: "n/a", evidence };
  }

  // Haversine distance (km) — copied inline to avoid the geo helper dependency loop
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const a = { lat: profile!.homeLat!, lng: profile!.homeLng! };
  const b = { lat: company!.hqLat!, lng: company!.hqLng! };
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat));
  const km = 2 * R * Math.asin(Math.sqrt(h));

  let score: number;
  if (km <= 10) score = 95;
  else if (km <= 30) score = 85;
  else if (km <= 80) score = 70; // commutable
  else if (km <= 200) score = 50; // long but possible
  else if (km <= 1000) score = 25; // would require relocation
  else score = 10;

  if (onsiteOnly) score = Math.max(0, score - 10);
  if (hybrid) evidence.push(`Hybrid — ${Math.round(km).toLocaleString()} km from your home`);
  else if (onsiteOnly)
    evidence.push(`Onsite — ${Math.round(km).toLocaleString()} km from your home`);
  else evidence.push(`${Math.round(km).toLocaleString()} km from your home`);

  return { key: "logistics", label: "Logistics", score, band: bandFor(score), evidence };
}

// ─────────────────────────────────────────────────────────────────────────
// Top-level
// ─────────────────────────────────────────────────────────────────────────

export function computeFitReport(
  job: JobListing,
  cv: CvJson | null,
  company: Company | null,
  profile: Profile | null,
): FitReport {
  const skills = classifyJobSkills(job.description, cv?.skills, job.title);
  const dimensions: FitDimension[] = [
    scoreSkills(skills),
    scoreExperience(job, cv),
    scoreCulture(job),
    scoreCompensation(job),
    scoreLogistics(job, company, profile),
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
