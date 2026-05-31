// Cross-source dedupe hash. See doc/plans/2026-05-31-rolehunter-v3-design.md §7.3.

import crypto from "node:crypto";
import type { RawJob } from "./types";

function norm(s: string | undefined | null): string {
  return (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function dedupeHash(j: RawJob): string {
  const cityCandidate = j.location?.city ?? j.location?.raw ?? "";
  const city = norm(cityCandidate);
  const dateKey = (() => {
    if (!j.postedAt) return "unknown";
    const parsed = new Date(j.postedAt);
    if (Number.isNaN(parsed.getTime())) return "unknown";
    return parsed.toISOString().slice(0, 10);
  })();
  const key = `${norm(j.title)}|${norm(j.company)}|${city}|${dateKey}`;
  return crypto.createHash("md5").update(key).digest("hex");
}
