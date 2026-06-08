// Renders a plain-text or markdown job description as structured, fast-to-read prose:
//   - Normalizes markdown delimiters and merges broken bullets/bold blocks
//   - Renders with ReactMarkdown & remarkGfm
//   - Tech tokens (first occurrence) get a subtle inline accent so technical
//     stack jumps out at a glance
//
// Optimized for copy-paste to avoid list items splitting onto separate lines.

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { TECH_TOKENS } from "@/lib/tech-tokens";
import { cleanMarkdown } from "@/lib/utils/markdown-clean";

interface Props {
  description: string;
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

function highlightTree(node: React.ReactNode, used: Set<string>): React.ReactNode {
  if (node === null || node === undefined) return node;
  if (typeof node === "string") {
    return highlightTokens(node, used);
  }
  if (typeof node === "number" || typeof node === "boolean") {
    return node;
  }
  if (Array.isArray(node)) {
    return node.map((child) => highlightTree(child, used));
  }
  if (React.isValidElement(node)) {
    const el = node as React.ReactElement<{ children?: React.ReactNode; [key: string]: any }>;
    const children = el.props.children;
    if (children !== undefined && children !== null) {
      return React.cloneElement(el, {
        ...el.props,
        children: highlightTree(children, used),
      });
    }
  }
  return node;
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

  const cleanedText = cleanMarkdown(text);
  const used = new Set<string>();

  const components = {
    h1: ({ children }: { children?: React.ReactNode }) => (
      <h3 className="text-[12px] uppercase tracking-[0.18em] font-mono font-medium text-[var(--fg-3)] mt-6 mb-2 pb-1 border-b border-[var(--border)]">
        {highlightTree(children, used)}
      </h3>
    ),
    h2: ({ children }: { children?: React.ReactNode }) => (
      <h3 className="text-[12px] uppercase tracking-[0.18em] font-mono font-medium text-[var(--fg-3)] mt-6 mb-2 pb-1 border-b border-[var(--border)]">
        {highlightTree(children, used)}
      </h3>
    ),
    h3: ({ children }: { children?: React.ReactNode }) => (
      <h3 className="text-[12px] uppercase tracking-[0.18em] font-mono font-medium text-[var(--fg-3)] mt-6 mb-2 pb-1 border-b border-[var(--border)]">
        {highlightTree(children, used)}
      </h3>
    ),
    h4: ({ children }: { children?: React.ReactNode }) => (
      <h3 className="text-[12px] uppercase tracking-[0.18em] font-mono font-medium text-[var(--fg-3)] mt-6 mb-2 pb-1 border-b border-[var(--border)]">
        {highlightTree(children, used)}
      </h3>
    ),
    h5: ({ children }: { children?: React.ReactNode }) => (
      <h3 className="text-[12px] uppercase tracking-[0.18em] font-mono font-medium text-[var(--fg-3)] mt-6 mb-2 pb-1 border-b border-[var(--border)]">
        {highlightTree(children, used)}
      </h3>
    ),
    h6: ({ children }: { children?: React.ReactNode }) => (
      <h3 className="text-[12px] uppercase tracking-[0.18em] font-mono font-medium text-[var(--fg-3)] mt-6 mb-2 pb-1 border-b border-[var(--border)]">
        {highlightTree(children, used)}
      </h3>
    ),
    p: ({ children }: { children?: React.ReactNode }) => (
      <p className="text-[15px] leading-[1.65] text-[var(--fg-2)] my-3">
        {highlightTree(children, used)}
      </p>
    ),
    ul: ({ children }: { children?: React.ReactNode }) => (
      <ul className="space-y-1.5 pl-1 list-none my-3">
        {children}
      </ul>
    ),
    li: ({ children }: { children?: React.ReactNode }) => (
      <li
        className="text-[14px] leading-[1.55] text-[var(--fg-2)] relative pl-5"
        style={{ listStyleType: "none" }}
      >
        <span
          className="absolute left-0 top-0.5 text-[var(--accent)] font-mono text-[11px]"
          aria-hidden
        >
          ▸
        </span>
        <span>{highlightTree(children, used)}</span>
      </li>
    ),
    ol: ({ children }: { children?: React.ReactNode }) => (
      <ol className="space-y-1.5 pl-5 list-decimal text-[14px] leading-[1.55] text-[var(--fg-2)] my-3">
        {children}
      </ol>
    ),
    strong: ({ children }: { children?: React.ReactNode }) => (
      <strong className="font-semibold text-[var(--fg-1)]">
        {highlightTree(children, used)}
      </strong>
    ),
    em: ({ children }: { children?: React.ReactNode }) => (
      <em className="italic">
        {highlightTree(children, used)}
      </em>
    ),
  };

  return (
    <article
      className="max-w-[72ch] space-y-4"
      style={{ fontFamily: "var(--font-serif)" }}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {cleanedText}
      </ReactMarkdown>
    </article>
  );
}
