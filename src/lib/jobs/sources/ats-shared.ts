// Shared helpers for the per-company ATS adapters (Workable, Ashby,
// SmartRecruiters). These mirror the inline helpers in greenhouse.ts / lever.ts
// but are factored out because three more adapters use the identical logic.
//
// See doc/plans/2026-05-31-rolehunter-v3-design.md §5.5 and epic #111.

import { SourcePermanentError, SourceTransientError, wrapUnknownError } from "./errors";
import type { RawJob } from "./types";

/** Lightweight HTML strip — ingest's normalize.ts does the full Markdown pass later. */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])\s*>/gi, "\n\n")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Every query term must appear in the title or description (AND semantics). */
export function matchesQuery(j: RawJob, query: string): boolean {
  if (!query) return true;
  const needles = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (needles.length === 0) return true;
  const haystack = `${j.title} ${j.description}`.toLowerCase();
  return needles.every((n) => haystack.includes(n));
}

export function matchesLocation(j: RawJob, location: string | undefined): boolean {
  if (!location) return true;
  const raw = j.location?.raw?.toLowerCase() ?? "";
  return raw.includes(location.toLowerCase());
}

/**
 * Common catch-block classification for the ATS adapters: re-throw our own
 * source errors untouched, map aborts to permanent, network/timeout to
 * transient, and wrap everything else.
 */
export function classifyAtsError(err: unknown, context: string): never {
  if (err instanceof SourcePermanentError || err instanceof SourceTransientError) throw err;
  const msg = err instanceof Error ? err.message : String(err);
  if (/aborted/i.test(msg)) throw new SourcePermanentError(msg, { cause: err });
  if (/network|timeout|ECONN|ETIMEDOUT|fetch failed/i.test(msg)) {
    throw new SourceTransientError(msg, { cause: err });
  }
  throw wrapUnknownError(err, context);
}

/**
 * Map an HTTP error response from a per-company ATS board to the right action:
 * - 404 → return "skip" (unknown company board, don't fail the whole run)
 * - 401/403 → throw permanent
 * - else → throw transient
 */
export function handleAtsHttpError(
  status: number,
  text: string,
  statusText: string,
  source: string,
): "skip" {
  if (status === 404) return "skip";
  if (status === 401 || status === 403) {
    throw new SourcePermanentError(`${source} auth (${status}): ${text}`);
  }
  throw new SourceTransientError(`${source} ${status}: ${text || statusText}`);
}
