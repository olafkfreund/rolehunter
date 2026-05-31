"use client";

import { useState } from "react";

interface Props {
  src: string | null | undefined;
  name: string;
  /** Tailwind size classes; defaults to w-10 h-10. */
  className?: string;
}

/**
 * Renders a company logo with a graceful fallback to the company's initial.
 * Clearbit's /logo endpoint 404s for unknown domains; without an onError
 * handler the browser shows a broken-image placeholder. This component
 * captures that error and swaps to the initials block.
 *
 * Client-only because server components can't pass event handlers.
 */
export function CompanyLogo({
  src,
  name,
  className = "w-10 h-10 rounded-md border border-[var(--border)] bg-[var(--bg)] object-contain p-1 shrink-0",
}: Props) {
  const [errored, setErrored] = useState(false);

  if (!src || errored) {
    return (
      <div
        className={`${className} flex items-center justify-center font-mono text-[var(--fg-3)] !p-0`}
        aria-label={`${name} logo placeholder`}
      >
        {(name || "?").slice(0, 1).toUpperCase()}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={`${name} logo`}
      className={className}
      onError={() => setErrored(true)}
    />
  );
}
