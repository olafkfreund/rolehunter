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

export interface ClassifiedSkill {
  token: string; // the JD-side label
  class: SkillClass;
  cvMatch: string | null; // what CV term we matched against, if any
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

export function classifyJobSkills(
  jobDescription: string,
  cvSkills: string[] | undefined,
  jobTitle = "",
): ClassifyResult {
  // Title carries decisive signal ("Senior Kubernetes engineer") that the
  // description often re-iterates — scan both.
  const jobTokens = extractTechTokens(`${jobTitle}\n${jobDescription}`);
  const cvLower = new Set((cvSkills ?? []).map(normalizeCvSkill));

  // Build a flat union of CV skills' family memberships so partial matches
  // can fire when JD says "React" and CV says "Vue", for instance.
  const cvFamilies: Set<Set<string>> = new Set();
  for (const s of cvLower) {
    const fam = familyOf(s);
    if (fam) cvFamilies.add(fam);
  }

  const classified: ClassifiedSkill[] = jobTokens.map((token) => {
    const lower = token.toLowerCase();
    // Exact match — try lower form and also try "next.js"/"nextjs" variants
    if (cvLower.has(lower)) {
      return { token, class: "matched", cvMatch: lower };
    }
    // Allow common spelling variants from the user's CV — collapse '.', '-'
    const collapsed = lower.replace(/[.\-\s]/g, "");
    for (const s of cvLower) {
      if (s.replace(/[.\-\s]/g, "") === collapsed) {
        return { token, class: "matched", cvMatch: s };
      }
    }
    // Partial: in same family as something the CV has
    const fam = familyOf(token);
    if (fam) {
      for (const cvFam of cvFamilies) {
        if (cvFam === fam) {
          // Find a CV term that's in this family for display
          for (const s of cvLower) {
            if (fam.has(s)) return { token, class: "partial", cvMatch: s };
          }
          return { token, class: "partial", cvMatch: null };
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
