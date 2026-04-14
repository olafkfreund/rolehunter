import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { Flashcard } from "../db/schema";
import { getProvider } from "../llm";
import type { CvJson, FlashcardOut, JobInput, Provider } from "../llm/types";
import { getActiveCv } from "./cv";
import { getJob } from "./jobs";

export type FlashcardRow = Flashcard;

export async function listForJob(jobId: number): Promise<FlashcardRow[]> {
  const db = getDb();
  return db
    .select()
    .from(schema.flashcards)
    .where(eq(schema.flashcards.jobId, jobId))
    .orderBy(asc(schema.flashcards.orderIdx), asc(schema.flashcards.id));
}

export async function countForJob(jobId: number): Promise<number> {
  const rows = await listForJob(jobId);
  return rows.length;
}

export async function getCard(id: number): Promise<FlashcardRow | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.flashcards)
    .where(eq(schema.flashcards.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function deleteForJob(jobId: number): Promise<void> {
  const db = getDb();
  await db.delete(schema.flashcards).where(eq(schema.flashcards.jobId, jobId));
}

export async function deleteCard(id: number): Promise<void> {
  const db = getDb();
  await db.delete(schema.flashcards).where(eq(schema.flashcards.id, id));
}

export async function upsertCards(
  jobId: number,
  cards: FlashcardOut[],
  provider: Provider,
): Promise<FlashcardRow[]> {
  const db = getDb();
  return await db.transaction(async (tx) => {
    await tx.delete(schema.flashcards).where(eq(schema.flashcards.jobId, jobId));
    if (cards.length === 0) return [];
    const values = cards.map((c, i) => ({
      jobId,
      category: c.category,
      question: c.question,
      answer: c.answer,
      provider,
      orderIdx: Number.isInteger(c.order) ? c.order : i,
    }));
    const inserted = await tx
      .insert(schema.flashcards)
      .values(values)
      .returning();
    return inserted;
  });
}

export async function generateForJob(
  jobId: number,
  provider: Provider,
): Promise<FlashcardRow[]> {
  const job = await getJob(jobId);
  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }
  const cv = await getActiveCv();
  if (!cv) {
    throw new Error("No active CV. Set one on /profile.");
  }

  const jobInput: JobInput = {
    title: job.title,
    company: job.company,
    location: job.location || undefined,
    description: job.description,
  };

  const llm = getProvider(provider);
  const cards = await llm.generateFlashcards(cv.parsedJson as CvJson, jobInput);
  return upsertCards(jobId, cards, llm.name);
}
