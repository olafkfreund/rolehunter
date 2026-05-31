// Culture cue vocabulary. Extracted to its own module so client components
// (profile-form.tsx etc.) can import the keyword list without pulling in
// fit-score.ts's full dependency chain (which transitively touches the DB
// via the work-location resolver and breaks the client bundle).

export interface CultureKeywordDef {
  key: string;
  label: string;
  rx: RegExp;
  positive: boolean;
}

export const CULTURE_KEYWORDS: CultureKeywordDef[] = [
  {
    key: "remote-first",
    label: "Remote-first",
    rx: /\b(remote[- ]first|fully remote|100% remote)\b/i,
    positive: true,
  },
  { key: "hybrid", label: "Hybrid", rx: /\bhybrid\b/i, positive: true },
  {
    key: "in-office",
    label: "In-office",
    rx: /\b(in[- ]office|on[- ]site|onsite)\b/i,
    positive: false,
  },
  {
    key: "async",
    label: "Async-first",
    rx: /\basynchronous\b|\basync(?:[- ]first| communication)\b/i,
    positive: true,
  },
  {
    key: "ownership",
    label: "Strong ownership",
    rx: /\b(ownership|own[- ]your|end[- ]to[- ]end ownership)\b/i,
    positive: true,
  },
  { key: "fast-paced", label: "Fast-paced", rx: /\bfast[- ]paced\b/i, positive: false },
  {
    key: "ambiguity",
    label: "Ambiguity",
    rx: /\b(ambiguity|comfortable with ambiguity|loosely defined)\b/i,
    positive: false,
  },
  {
    key: "scale",
    label: "Massive scale",
    rx: /\b(at scale|massive scale|hyper[- ]scale)\b/i,
    positive: true,
  },
  {
    key: "well-funded",
    label: "Well-funded",
    rx: /\b(series [a-d]|recently funded|well[- ]funded)\b/i,
    positive: true,
  },
  {
    key: "early-stage",
    label: "Early stage",
    rx: /\b(early stage|stealth|seed stage|pre[- ]product)\b/i,
    positive: false,
  },
];

export const CULTURE_KEYS = CULTURE_KEYWORDS.map((c) => c.key);
