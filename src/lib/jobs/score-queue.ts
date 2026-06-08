// In-memory async match() queue. Bounded concurrency (default 4). Fire-and-forget
// from ingest.ts on status="new". Lost on process restart by design — unscored
// jobs just appear with NULL top_score and the user can manually trigger via
// /api/match POST.
//
// Writes to the existing matches table and updates job_listings.top_score with
// monotonic-max semantics per Decision D-06.
//
// See doc/plans/2026-05-31-rolehunter-v3-design.md §7.5.

import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getProvider } from "@/lib/llm";
import type { CvJson, JobInput, Provider } from "@/lib/llm/types";
import { getActiveCv } from "@/lib/repo/cv";
import { insertMatch } from "@/lib/repo/matches";
import { getActivePortfolioItems } from "@/lib/repo/portfolio";

type ScoreTask = { jobId: number };

const queue: ScoreTask[] = [];
let inFlight = 0;
let maxConcurrencyCached: number | null = null;

function getMaxConcurrency(): number {
  if (maxConcurrencyCached !== null) return maxConcurrencyCached;
  const raw = process.env.MATCH_QUEUE_CONCURRENCY;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  maxConcurrencyCached = Number.isFinite(parsed) && parsed > 0 ? parsed : 4;
  return maxConcurrencyCached;
}

/**
 * Resolve which provider to use for auto-scoring. AUTO_SCORE_PROVIDER overrides
 * DEFAULT_LLM_PROVIDER. OpenAI / Ollama land in #47; for now they fall back
 * silently to DEFAULT_LLM_PROVIDER with a one-line warn.
 */
function resolveAutoScoreProvider(): Provider | undefined {
  const raw = process.env.AUTO_SCORE_PROVIDER;
  if (!raw) return undefined;
  if (raw === "claude" || raw === "gemini") return raw;
  if (raw === "openai" || raw === "ollama") {
    console.warn(
      `[score-queue] AUTO_SCORE_PROVIDER='${raw}' is reserved for #47; using DEFAULT_LLM_PROVIDER instead`,
    );
    return undefined;
  }
  console.warn(`[score-queue] unknown AUTO_SCORE_PROVIDER='${raw}'; using DEFAULT_LLM_PROVIDER`);
  return undefined;
}

export function enqueueScore(jobId: number): void {
  if (!Number.isFinite(jobId) || jobId <= 0) return;
  queue.push({ jobId });
  drain();
}

export function queueDepth(): number {
  return queue.length + inFlight;
}

function drain(): void {
  const max = getMaxConcurrency();
  while (inFlight < max && queue.length > 0) {
    const task = queue.shift()!;
    inFlight++;
    runScoreTask(task)
      .catch((err) =>
        console.warn("[score-queue] task crash", {
          jobId: task.jobId,
          err: err instanceof Error ? err.message : String(err),
        }),
      )
      .finally(() => {
        inFlight--;
        drain();
      });
  }
}

async function runScoreTask({ jobId }: ScoreTask): Promise<void> {
  const db = getDb();

  const [cv, portfolioItems] = await Promise.all([
    getActiveCv(),
    getActivePortfolioItems(),
  ]);
  if (!cv) {
    // Common in fresh installs; not an error.
    return;
  }

  const jobs = await db
    .select()
    .from(schema.jobListings)
    .where(eq(schema.jobListings.id, jobId))
    .limit(1);
  const job = jobs[0];
  if (!job) {
    console.warn("[score-queue] job missing by id", { jobId });
    return;
  }

  const jobInput: JobInput = {
    title: job.title,
    company: job.company,
    location: job.location || undefined,
    description: job.description,
  };

  let llm;
  try {
    llm = getProvider(resolveAutoScoreProvider());
  } catch (err) {
    console.warn("[score-queue] no LLM provider available; auto-score disabled", err);
    return;
  }

  let result;
  try {
    result = await llm.match(cv.parsedJson as CvJson, jobInput, portfolioItems);
  } catch (err) {
    console.warn("[score-queue] llm.match failed", {
      jobId,
      provider: llm.name,
      err: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  const score = Math.max(0, Math.min(100, Math.round(result.score)));
  const strengths = Array.isArray(result.strengths)
    ? result.strengths.filter((s): s is string => typeof s === "string")
    : [];
  const gaps = Array.isArray(result.gaps)
    ? result.gaps.filter((g): g is string => typeof g === "string")
    : [];

  try {
    await insertMatch({
      jobId,
      cvMasterId: cv.id,
      provider: llm.name,
      score,
      strengths,
      gaps,
      reasoningMd: result.reasoning,
    });
  } catch (err) {
    console.warn("[score-queue] insertMatch failed", { jobId, err });
    return;
  }

  // Monotonic-max top_score (D-06): swap CVs preserves the best historical
  // score; future #47/embeddings work can change semantics if needed.
  try {
    await db
      .update(schema.jobListings)
      .set({
        topScore: sql`GREATEST(COALESCE(${schema.jobListings.topScore}, 0), ${score})` as unknown as number,
      })
      .where(eq(schema.jobListings.id, jobId));
  } catch (err) {
    console.warn("[score-queue] top_score update failed", { jobId, err });
  }
}

/** Test/dev helper — waits until the queue drains. Not for production use. */
export async function _drainForTests(): Promise<void> {
  while (inFlight > 0 || queue.length > 0) {
    await new Promise((r) => setTimeout(r, 25));
  }
}
