// Per-user skill overrides for the role-fit dashboard.
//
// The classifier (src/lib/jobs/skill-classify.ts) resolves JD tokens against
// CV → portfolio → families. The user clicks a chip on /jobs/[id]'s fit
// dashboard to override the result: "I do have this skill" (matched) or
// "no, I don't" (missing). Stored on profile.skill_overrides as
// { matched: [], missing: [] } arrays of lowercase canonical tokens.

import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getProfile } from "./profile";

export interface SkillOverrides {
  matched: string[]; // lowercase tokens forced to "matched"
  missing: string[]; // lowercase tokens forced to "missing"
}

export type SkillOverrideAction = "match" | "miss" | "clear";

const EMPTY: SkillOverrides = { matched: [], missing: [] };

export function normalizeToken(token: string): string {
  return token.trim().toLowerCase();
}

export async function getSkillOverrides(): Promise<SkillOverrides> {
  const profile = await getProfile();
  const raw = (profile as unknown as { skillOverrides?: unknown }).skillOverrides;
  if (!raw || typeof raw !== "object") return { ...EMPTY };
  const r = raw as Partial<SkillOverrides>;
  return {
    matched: Array.isArray(r.matched)
      ? r.matched.filter((s): s is string => typeof s === "string")
      : [],
    missing: Array.isArray(r.missing)
      ? r.missing.filter((s): s is string => typeof s === "string")
      : [],
  };
}

/**
 * Apply the user's action to a single token. Idempotent — saving the same
 * action twice has no effect. Returns the new full overrides state so the
 * caller can echo it back to the UI without a second read.
 *
 *   match → ensure token is in `matched`, remove from `missing`
 *   miss  → ensure token is in `missing`, remove from `matched`
 *   clear → remove from both
 */
export async function setSkillOverride(
  token: string,
  action: SkillOverrideAction,
): Promise<SkillOverrides> {
  const norm = normalizeToken(token);
  if (!norm) throw new Error("token is required");

  const current = await getSkillOverrides();
  const matched = new Set(current.matched.map(normalizeToken));
  const missing = new Set(current.missing.map(normalizeToken));

  if (action === "match") {
    matched.add(norm);
    missing.delete(norm);
  } else if (action === "miss") {
    missing.add(norm);
    matched.delete(norm);
  } else if (action === "clear") {
    matched.delete(norm);
    missing.delete(norm);
  }

  const next: SkillOverrides = {
    matched: Array.from(matched).sort(),
    missing: Array.from(missing).sort(),
  };

  const db = getDb();
  await db
    .update(schema.profile)
    .set({
      skillOverrides: next,
      updatedAt: sql`NOW()` as unknown as Date,
    })
    .where(eq(schema.profile.id, 1));

  return next;
}

export function overrideStateFor(
  token: string,
  overrides: SkillOverrides,
): SkillOverrideAction | null {
  const norm = normalizeToken(token);
  if (overrides.matched.map(normalizeToken).includes(norm)) return "match";
  if (overrides.missing.map(normalizeToken).includes(norm)) return "miss";
  return null;
}
