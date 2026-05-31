// Extracts a flat list of (skill token, source-project) pairs from the
// user's portfolio items — the GitHub/GitLab repos + manual projects/skills/
// roles already in the portfolio_items table.
//
// Source of tokens per portfolio row:
//   1. The `tech` array (GitHub topics, GitLab project tags, manually-entered
//      tech for manual_project rows) — high-confidence; user-curated.
//   2. The README/description text — scanned with the shared TECH_TOKENS
//      allowlist. Lower-confidence but catches stack signals the user didn't
//      explicitly tag.
//
// Hidden items (portfolio_items.hidden=true) are excluded so the user has
// control over what counts.

import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { extractTechTokens } from "@/lib/tech-tokens";
import type { PortfolioSkillContext } from "./skill-classify";

export interface PortfolioSkillBundle {
  contexts: PortfolioSkillContext[];
  /** Distinct project titles consulted. Useful for UI evidence. */
  projectCount: number;
}

/**
 * Pull every visible portfolio item and emit (token, project) pairs. Dedupe
 * happens at the call site (skill-classify uses the first seen project per
 * lowercase token).
 */
export async function loadPortfolioSkillContext(): Promise<PortfolioSkillBundle> {
  const db = getDb();
  const rows = await db
    .select({
      id: schema.portfolioItems.id,
      title: schema.portfolioItems.title,
      description: schema.portfolioItems.description,
      tech: schema.portfolioItems.tech,
    })
    .from(schema.portfolioItems)
    .where(sql`${schema.portfolioItems.hidden} = false`)
    .limit(200);

  const contexts: PortfolioSkillContext[] = [];
  for (const r of rows) {
    const project = r.title || "(untitled project)";
    // Curated tech tags first — these are the strongest signal.
    if (Array.isArray(r.tech)) {
      for (const t of r.tech as string[]) {
        if (typeof t === "string" && t.trim().length > 0) {
          contexts.push({ token: t.trim(), project });
        }
      }
    }
    // Description / README scan — broader recall.
    if (r.description && r.description.length > 0) {
      const scanned = extractTechTokens(r.description.slice(0, 8_000));
      for (const t of scanned) contexts.push({ token: t, project });
    }
  }
  return { contexts, projectCount: rows.length };
}
