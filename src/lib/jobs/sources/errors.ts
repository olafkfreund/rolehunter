// Typed errors that adapters throw. Scheduler decides retry-vs-fail based on type.
// See doc/plans/2026-05-31-rolehunter-v3-design.md §5.4.

export class SourceTransientError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SourceTransientError";
  }
}

export class SourcePermanentError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SourcePermanentError";
  }
}

export class SourceBudgetError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SourceBudgetError";
  }
}

export function wrapUnknownError(err: unknown, context: string): SourcePermanentError {
  if (err instanceof SourceTransientError || err instanceof SourcePermanentError || err instanceof SourceBudgetError) {
    return err as SourcePermanentError;
  }
  const message = err instanceof Error ? err.message : String(err);
  return new SourcePermanentError(`${context}: ${message}`, { cause: err });
}
