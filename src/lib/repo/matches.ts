import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { Match } from "@/lib/db/schema";
import type { Provider } from "@/lib/llm/types";

export async function getLatestMatch(jobId: number): Promise<Match | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.matches)
    .where(eq(schema.matches.jobId, jobId))
    .orderBy(desc(schema.matches.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function listMatchesForJob(jobId: number): Promise<Match[]> {
  const db = getDb();
  return db
    .select()
    .from(schema.matches)
    .where(eq(schema.matches.jobId, jobId))
    .orderBy(desc(schema.matches.createdAt));
}

export async function insertMatch(params: {
  jobId: number;
  cvMasterId: number;
  provider: Provider;
  score: number;
  strengths: string[];
  gaps: string[];
  reasoningMd: string;
}): Promise<Match> {
  const db = getDb();
  const rows = await db
    .insert(schema.matches)
    .values({
      jobId: params.jobId,
      cvMasterId: params.cvMasterId,
      provider: params.provider,
      score: params.score,
      strengths: params.strengths as unknown as Record<string, unknown>[],
      gaps: params.gaps as unknown as Record<string, unknown>[],
      reasoningMd: params.reasoningMd,
    })
    .returning();
  return rows[0];
}
