// Classifies extracted JD skills against the user's CV: each skill is
// "matched" (in CV verbatim or close family), "partial" (related family),
// or "missing" (not in CV). Used by the role-fit dashboard chip strip.
//
// Pure local pattern matching — no LLM call. Color coding from the user:
//   green  → matched
//   yellow → partial / close family
//   red    → missing

import { extractTechTokens } from "@/lib/tech-tokens";

export type SkillClass = "matched" | "partial" | "missing";
export type SkillEvidence = "cv" | "portfolio" | "override";

export interface ClassifiedSkill {
  token: string; // the JD-side label
  class: SkillClass;
  cvMatch: string | null; // what CV/portfolio term we matched against, if any
  /** Where the proof came from — CV, portfolio, or a user override. */
  evidence?: SkillEvidence;
  /** When evidence is "portfolio", the project title that surfaced the token. */
  portfolioProject?: string;
  /** True when the result was forced by a user override. */
  overridden?: boolean;
}

export interface SkillOverridesInput {
  matched?: string[];
  missing?: string[];
}

// Token families: a hit on any sibling counts as a "partial" match for the
// queried token. Keeps fast pattern: lowercase set lookup.
const FAMILIES: Array<Set<string>> = [
  // SQL family
  new Set(["postgresql", "postgres", "mysql", "mariadb", "sqlite", "sql"]),
  // NoSQL family
  new Set(["mongodb", "dynamodb", "cassandra"]),
  // Search engines
  new Set(["elasticsearch", "opensearch"]),
  // Cloud platforms
  new Set(["aws", "azure", "gcp", "google cloud"]),
  // Container orchestration
  new Set(["kubernetes", "k8s", "openshift", "rancher", "nomad"]),
  // IaC
  new Set(["terraform", "opentofu", "pulumi", "cloudformation", "cdk"]),
  // Config mgmt
  new Set(["ansible", "chef", "puppet", "saltstack"]),
  // GitOps
  new Set(["argocd", "flux", "tekton"]),
  // Observability
  new Set(["prometheus", "grafana", "datadog", "new relic", "honeycomb"]),
  // ML frameworks
  new Set(["pytorch", "tensorflow", "jax", "keras"]),
  // LLM hosts
  new Set(["openai", "anthropic", "claude", "gemini", "mistral", "llama"]),
  // JS frameworks
  new Set(["react", "vue", "svelte", "angular", "solid"]),
  // Meta-frameworks
  new Set(["next.js", "nuxt", "sveltekit", "remix"]),
  // JS runtimes
  new Set(["node.js", "bun", "deno"]),
  // Streaming
  new Set(["kafka", "rabbitmq", "nats", "pulsar"]),
  // CI
  new Set(["github actions", "gitlab ci", "circleci", "jenkins", "buildkite", "drone"]),
];

function familyOf(token: string): Set<string> | null {
  const lower = token.toLowerCase();
  for (const fam of FAMILIES) {
    if (fam.has(lower)) return fam;
  }
  return null;
}

function normalizeCvSkill(s: string): string {
  return s.toLowerCase().trim();
}

export interface ClassifyResult {
  jobTokens: string[]; // tokens detected in JD, in order found
  classified: ClassifiedSkill[];
  matchedCount: number;
  partialCount: number;
  missingCount: number;
  coveragePct: number; // 0-100, matched + 0.5 * partial / total
}

export interface PortfolioSkillContext {
  /** Token from a portfolio repo's tech list or extracted from README/desc. */
  token: string;
  /** Project title that surfaced this token — used for evidence display. */
  project: string;
}

export function classifyJobSkills(
  jobDescription: string,
  cvSkills: string[] | undefined,
  jobTitle = "",
  portfolio: PortfolioSkillContext[] = [],
  overrides: SkillOverridesInput = {},
): ClassifyResult {
  // Title carries decisive signal ("Senior Kubernetes engineer") that the
  // description often re-iterates — scan both.
  const jobTokens = extractTechTokens(`${jobTitle}\n${jobDescription}`);
  const cvLower = new Set((cvSkills ?? []).map(normalizeCvSkill));

  // User overrides applied AFTER everything else. Lowercase canonical.
  const overrideMatched = new Set(
    (overrides.matched ?? [])
      .map((s) => (typeof s === "string" ? normalizeCvSkill(s) : ""))
      .filter((s) => s.length > 0),
  );
  const overrideMissing = new Set(
    (overrides.missing ?? [])
      .map((s) => (typeof s === "string" ? normalizeCvSkill(s) : ""))
      .filter((s) => s.length > 0),
  );

  // Portfolio tokens → project. Lowercase key for matching; keep the
  // project title so evidence can render "matched via <project>".
  const portfolioMap = new Map<string, string>();
  for (const p of portfolio) {
    const k = normalizeCvSkill(p.token);
    if (k && !portfolioMap.has(k)) portfolioMap.set(k, p.project);
  }

  // Build a flat union of CV + portfolio skills' family memberships so
  // partial matches can fire across both sources.
  const cvFamilies: Set<Set<string>> = new Set();
  for (const s of cvLower) {
    const fam = familyOf(s);
    if (fam) cvFamilies.add(fam);
  }
  const portfolioFamilies: Map<Set<string>, string> = new Map();
  for (const [k, project] of portfolioMap) {
    const fam = familyOf(k);
    if (fam && !portfolioFamilies.has(fam)) portfolioFamilies.set(fam, project);
  }

  const classified: ClassifiedSkill[] = jobTokens.map((token) => {
    const lower = token.toLowerCase();

    // User overrides win over everything else. Token comparison is on the
    // normalized lowercase form so "Java" / "java" / "JAVA" all flip with
    // one click.
    if (overrideMatched.has(lower)) {
      return {
        token,
        class: "matched",
        cvMatch: lower,
        evidence: "override",
        overridden: true,
      };
    }
    if (overrideMissing.has(lower)) {
      return {
        token,
        class: "missing",
        cvMatch: null,
        evidence: "override",
        overridden: true,
      };
    }

    // CV exact match
    if (cvLower.has(lower)) {
      return { token, class: "matched", cvMatch: lower, evidence: "cv" };
    }
    // CV normalized-spelling match (next.js / nextjs)
    const collapsed = lower.replace(/[.\-\s]/g, "");
    for (const s of cvLower) {
      if (s.replace(/[.\-\s]/g, "") === collapsed) {
        return { token, class: "matched", cvMatch: s, evidence: "cv" };
      }
    }
    // Portfolio exact match
    if (portfolioMap.has(lower)) {
      return {
        token,
        class: "matched",
        cvMatch: lower,
        evidence: "portfolio",
        portfolioProject: portfolioMap.get(lower)!,
      };
    }
    // Portfolio normalized-spelling match
    for (const [pk, project] of portfolioMap) {
      if (pk.replace(/[.\-\s]/g, "") === collapsed) {
        return {
          token,
          class: "matched",
          cvMatch: pk,
          evidence: "portfolio",
          portfolioProject: project,
        };
      }
    }
    // Partial: CV family hit
    const fam = familyOf(token);
    if (fam) {
      for (const cvFam of cvFamilies) {
        if (cvFam === fam) {
          for (const s of cvLower) {
            if (fam.has(s)) return { token, class: "partial", cvMatch: s, evidence: "cv" };
          }
          return { token, class: "partial", cvMatch: null, evidence: "cv" };
        }
      }
      // Partial: portfolio family hit
      for (const [pFam, project] of portfolioFamilies) {
        if (pFam === fam) {
          for (const [pk] of portfolioMap) {
            if (fam.has(pk)) {
              return {
                token,
                class: "partial",
                cvMatch: pk,
                evidence: "portfolio",
                portfolioProject: project,
              };
            }
          }
          return {
            token,
            class: "partial",
            cvMatch: null,
            evidence: "portfolio",
            portfolioProject: project,
          };
        }
      }
    }
    return { token, class: "missing", cvMatch: null };
  });

  const matchedCount = classified.filter((c) => c.class === "matched").length;
  const partialCount = classified.filter((c) => c.class === "partial").length;
  const missingCount = classified.filter((c) => c.class === "missing").length;
  const total = classified.length;
  const coveragePct =
    total > 0 ? Math.round(((matchedCount + 0.5 * partialCount) / total) * 100) : 0;

  return {
    jobTokens,
    classified,
    matchedCount,
    partialCount,
    missingCount,
    coveragePct,
  };
}
