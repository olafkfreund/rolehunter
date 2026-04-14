"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const CATEGORY_LABELS: Record<string, string> = {
  behavioral: "Behavioral",
  role_specific: "Role-specific",
  company_specific: "Company-specific",
  technical: "Technical",
};

export function Flashcard({
  question,
  answer,
  category,
  index,
  total,
}: {
  question: string;
  answer: string;
  category: string;
  index: number;
  total: number;
}) {
  const [flipped, setFlipped] = useState(false);

  // Reset flip when the card changes.
  useEffect(() => {
    setFlipped(false);
  }, [question, answer]);

  const categoryLabel = CATEGORY_LABELS[category] ?? category;

  return (
    <div
      className="[perspective:1000px] w-full select-none"
      onClick={() => setFlipped((v) => !v)}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          setFlipped((v) => !v);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={flipped ? "Show question" : "Show answer"}
    >
      <div
        className="relative w-full min-h-[320px] cursor-pointer transition-transform duration-[400ms] [transform-style:preserve-3d]"
        style={{ transform: `rotateY(${flipped ? 180 : 0}deg)` }}
      >
        {/* Front — Question */}
        <div className="absolute inset-0 flex min-h-[320px] w-full flex-col justify-between rounded-xl border border-[var(--border)] bg-[var(--background)] p-6 shadow-sm [backface-visibility:hidden]">
          <div className="flex items-start justify-between gap-3">
            <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
              Question
            </span>
            <span className="rounded-full border border-[var(--border)] bg-[var(--muted)]/50 px-2.5 py-0.5 text-[11px] font-medium text-[var(--foreground)]">
              {categoryLabel}
            </span>
          </div>
          <div className="flex flex-1 items-center justify-center px-2 py-6">
            <p className="text-center text-lg font-medium leading-relaxed text-[var(--foreground)]">
              {question}
            </p>
          </div>
          <div className="text-center text-xs text-[var(--muted-foreground)]">
            {index}/{total} · tap to flip
          </div>
        </div>

        {/* Back — Answer */}
        <div className="absolute inset-0 flex min-h-[320px] w-full flex-col justify-between rounded-xl border border-[var(--border)] bg-[var(--muted)]/30 p-6 shadow-sm [backface-visibility:hidden] [transform:rotateY(180deg)]">
          <div className="flex items-start justify-between gap-3">
            <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
              Answer
            </span>
            <span className="rounded-full border border-[var(--border)] bg-[var(--background)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--foreground)]">
              {categoryLabel}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto py-4 text-sm leading-relaxed text-[var(--foreground)]">
            <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-2 prose-strong:text-[var(--foreground)] prose-li:my-0.5">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {answer}
              </ReactMarkdown>
            </div>
          </div>
          <div className="text-center text-xs text-[var(--muted-foreground)]">
            {index}/{total} · tap to flip back
          </div>
        </div>
      </div>
    </div>
  );
}
