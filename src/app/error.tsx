"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 p-6">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-[var(--muted-foreground)]">{error.message || "Unexpected error"}</p>
      {error.digest && (
        <p className="text-xs text-[var(--muted-foreground)]">Digest: {error.digest}</p>
      )}
      <div className="flex gap-2">
        <button
          onClick={reset}
          className="rounded-md bg-[var(--foreground)] px-3 py-1.5 text-sm text-[var(--background)]"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
