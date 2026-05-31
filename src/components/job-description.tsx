// Renders a plain-text job description as structured, fast-to-read prose:
//   - Lines starting with •, -, *, ◦ become real list items
//   - Numbered lines (1. / 1)) become ordered lists
//   - Short standalone lines ending with ":" or matching known heading
//     keywords become section headings
//   - Consecutive prose lines collapse into paragraphs
//   - Tech tokens (first occurrence) get a subtle inline accent so technical
//     stack jumps out at a glance
//
// Pure server-side rendering — no LLM, no client JS, no markdown library.

import { TECH_TOKENS } from "@/lib/tech-tokens";

interface Props {
  description: string;
}

type Block =
  | { kind: "heading"; text: string }
  | { kind: "para"; lines: string[] }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] };

const BULLET_RX = /^[\s]*[•\-*◦·]\s+(.+)$/;
const ORDERED_RX = /^[\s]*(\d+)[.)]\s+(.+)$/;

// Conservative heading detector. Short standalone line (< 80 chars) that
// either ends in ":" or matches one of a curated set of recruiter-canonical
// section labels.
const KNOWN_HEADINGS = new Set([
  "the role",
  "the company",
  "about us",
  "about you",
  "about the role",
  "about the company",
  "responsibilities",
  "key responsibilities",
  "your responsibilities",
  "what you'll do",
  "what you will do",
  "what you'll be doing",
  "what you'll bring",
  "requirements",
  "required skills",
  "required experience",
  "must-have",
  "must have",
  "qualifications",
  "minimum qualifications",
  "preferred qualifications",
  "nice to have",
  "nice-to-have",
  "bonus",
  "bonus points",
  "what we offer",
  "benefits",
  "perks",
  "compensation",
  "salary",
  "location",
  "how to apply",
  "next steps",
  "key skills",
  "skills",
  "experience",
  "tech stack",
  "technologies",
  "our stack",
]);

function isHeading(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.length > 80) return false;
  const lower = trimmed.toLowerCase().replace(/:$/, "").trim();
  if (KNOWN_HEADINGS.has(lower)) return true;
  // Lines ending with ":" that are short and have no internal sentence-ish
  // punctuation. ("Required skills:" yes; "Send your CV to: contact@x.com" no.)
  if (trimmed.endsWith(":") && trimmed.length <= 60 && !/[.,;]/.test(trimmed.slice(0, -1))) {
    return true;
  }
  return false;
}

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const lines = text.split(/\r?\n/);

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (trimmed === "") {
      i++;
      continue;
    }

    // Section heading?
    if (isHeading(trimmed)) {
      blocks.push({ kind: "heading", text: trimmed.replace(/:$/, "").trim() });
      i++;
      continue;
    }

    // Bullet list?
    const bm = trimmed.match(BULLET_RX);
    if (bm) {
      const items: string[] = [bm[1].trim()];
      i++;
      while (i < lines.length) {
        const m = lines[i].trim().match(BULLET_RX);
        if (!m) break;
        items.push(m[1].trim());
        i++;
      }
      blocks.push({ kind: "ul", items });
      continue;
    }

    // Ordered list?
    const om = trimmed.match(ORDERED_RX);
    if (om) {
      const items: string[] = [om[2].trim()];
      i++;
      while (i < lines.length) {
        const m = lines[i].trim().match(ORDERED_RX);
        if (!m) break;
        items.push(m[2].trim());
        i++;
      }
      blocks.push({ kind: "ol", items });
      continue;
    }

    // Otherwise: accumulate consecutive prose lines into a paragraph.
    const para: string[] = [trimmed];
    i++;
    while (i < lines.length) {
      const l = lines[i].trim();
      if (l === "" || isHeading(l) || BULLET_RX.test(l) || ORDERED_RX.test(l)) break;
      para.push(l);
      i++;
    }
    blocks.push({ kind: "para", lines: para });
  }

  return blocks;
}

// Build one regex that matches any tech token; word boundaries; first
// occurrence highlighted with an inline accent span.
function buildTokenRegex(): RegExp {
  const escaped = TECH_TOKENS.map((t) =>
    t.replace(/[.+#\-()*]/g, "\\$&").replace(/\s+/g, "\\s+"),
  )
    .sort((a, b) => b.length - a.length) // longest first so "Next.js" wins over "Next"
    .join("|");
  return new RegExp(`\\b(${escaped})\\b`, "gi");
}

const TOKEN_RX = buildTokenRegex();

function highlightTokens(text: string, used: Set<string>): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  TOKEN_RX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_RX.exec(text)) !== null) {
    const matched = match[1];
    const key = matched.toLowerCase();
    if (used.has(key)) continue;
    used.add(key);
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    parts.push(
      <span
        key={`${key}-${match.index}`}
        className="font-mono text-[0.95em] px-1 py-[1px] rounded-sm"
        style={{
          color: "var(--accent)",
          background: "color-mix(in srgb, var(--accent) 10%, transparent)",
        }}
      >
        {matched}
      </span>,
    );
    lastIndex = match.index + matched.length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length > 0 ? <>{parts}</> : text;
}

export function JobDescription({ description }: Props) {
  const text = description?.trim();
  if (!text) {
    return (
      <div className="text-[13px] text-[var(--fg-3)] italic">
        No description on record for this job.
      </div>
    );
  }

  const blocks = parseBlocks(text);
  const used = new Set<string>(); // tracks which tech tokens have been highlighted

  return (
    <article
      className="max-w-[72ch] space-y-4"
      style={{ fontFamily: "var(--font-serif)" }}
    >
      {blocks.map((b, idx) => {
        if (b.kind === "heading") {
          return (
            <h3
              key={idx}
              className="text-[12px] uppercase tracking-[0.18em] font-mono font-medium text-[var(--fg-3)] mt-6 mb-2 pb-1 border-b border-[var(--border)]"
            >
              {b.text}
            </h3>
          );
        }
        if (b.kind === "para") {
          const joined = b.lines.join(" ");
          return (
            <p
              key={idx}
              className="text-[15px] leading-[1.65] text-[var(--fg-2)]"
            >
              {highlightTokens(joined, used)}
            </p>
          );
        }
        if (b.kind === "ul") {
          return (
            <ul key={idx} className="space-y-1.5 pl-1">
              {b.items.map((it, i) => (
                <li
                  key={i}
                  className="text-[14px] leading-[1.55] text-[var(--fg-2)] grid grid-cols-[14px_1fr] gap-2"
                >
                  <span
                    className="text-[var(--accent)] mt-[0.2em] font-mono text-[11px]"
                    aria-hidden
                  >
                    ▸
                  </span>
                  <span>{highlightTokens(it, used)}</span>
                </li>
              ))}
            </ul>
          );
        }
        if (b.kind === "ol") {
          return (
            <ol key={idx} className="space-y-1.5 pl-1">
              {b.items.map((it, i) => (
                <li
                  key={i}
                  className="text-[14px] leading-[1.55] text-[var(--fg-2)] grid grid-cols-[20px_1fr] gap-2"
                >
                  <span className="font-mono text-[12px] text-[var(--fg-3)] mt-[0.15em]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span>{highlightTokens(it, used)}</span>
                </li>
              ))}
            </ol>
          );
        }
        return null;
      })}
    </article>
  );
}
