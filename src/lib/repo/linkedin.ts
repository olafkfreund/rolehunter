import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { LinkedinScan, Profile } from "../db/schema";
import type { Provider } from "../llm/types";

type KeywordCoverage = Record<string, boolean>;

export async function insertScan(params: {
  targetRole: string;
  provider: Provider;
  score: number;
  keywordCoverage: KeywordCoverage;
  suggestionsMd: string;
  rewrittenHeadline?: string | null;
  rewrittenAbout?: string | null;
}): Promise<LinkedinScan> {
  const db = getDb();
  const rows = await db
    .insert(schema.linkedinScans)
    .values({
      targetRole: params.targetRole,
      provider: params.provider,
      score: params.score,
      keywordCoverage: params.keywordCoverage as unknown as Record<string, unknown>,
      suggestionsMd: params.suggestionsMd,
      rewrittenHeadline: params.rewrittenHeadline ?? null,
      rewrittenAbout: params.rewrittenAbout ?? null,
    })
    .returning();
  return rows[0];
}

export async function listRecentScans(limit = 10): Promise<LinkedinScan[]> {
  const db = getDb();
  return db
    .select()
    .from(schema.linkedinScans)
    .orderBy(desc(schema.linkedinScans.createdAt))
    .limit(limit);
}

export async function getScan(id: number): Promise<LinkedinScan | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.linkedinScans)
    .where(eq(schema.linkedinScans.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export type { Profile };
