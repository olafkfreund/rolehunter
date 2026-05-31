"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Editorial-styled markdown renderer that honors the design system tokens.
 * Use for LLM-generated content (CV reviews, gap reasoning, section rewrites).
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="space-y-2 text-[12px] leading-relaxed text-[var(--fg-2)]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1
              className="text-[17px] font-medium tracking-tight text-[var(--fg)] mt-3 mb-1"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2
              className="text-[14px] font-medium tracking-tight text-[var(--fg)] mt-3 mb-1"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-[13px] font-medium text-[var(--fg)] mt-2 mb-0.5">{children}</h3>
          ),
          p: ({ children }) => <p className="my-2">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-5 space-y-1.5 my-2">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1.5 my-2">{children}</ol>,
          li: ({ children }) => <li className="leading-snug">{children}</li>,
          strong: ({ children }) => (
            <strong className="font-semibold text-[var(--fg)]">{children}</strong>
          ),
          em: ({ children }) => (
            <em
              className="italic text-[var(--fg)]"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {children}
            </em>
          ),
          code: ({ children }) => (
            <code className="font-mono text-[11px] bg-[var(--bg-elev-2)] px-1 py-0.5 rounded text-[var(--fg)]">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="font-mono text-[11px] bg-[var(--bg-elev-2)] p-3 rounded-sm overflow-x-auto my-2">
              {children}
            </pre>
          ),
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--accent)] underline underline-offset-2 decoration-[var(--border-hi)] hover:decoration-[var(--accent)]"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-[var(--border-hi)] pl-3 italic text-[var(--fg-3)] my-2">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="border-[var(--border)] my-3" />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
