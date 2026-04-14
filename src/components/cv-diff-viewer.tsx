"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function CvDiffViewer({
  original,
  tailored,
}: {
  original: string;
  tailored: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Column label="Original" content={original} />
      <Column label="Tailored" content={tailored} />
    </div>
  );
}

function Column({ label, content }: { label: string; content: string }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--background)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--muted)]/40 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
          {label}
        </span>
      </div>
      <div className="prose-cv max-h-[600px] overflow-y-auto px-4 py-3 text-sm">
        {content?.trim() ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        ) : (
          <p className="text-[var(--muted-foreground)]">Nothing to show yet.</p>
        )}
      </div>
    </div>
  );
}
