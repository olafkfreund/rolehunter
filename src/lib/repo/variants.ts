import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { CvVariant } from "@/lib/db/schema";
import type { Provider } from "@/lib/llm/types";

export async function insertVariant(params: {
  jobId: number;
  matchId?: number | null;
  tailoredMarkdown: string;
  keywords: string[];
  provider: Provider;
}): Promise<CvVariant> {
  const db = getDb();
  const rows = await db
    .insert(schema.cvVariants)
    .values({
      jobId: params.jobId,
      matchId: params.matchId ?? null,
      tailoredMarkdown: params.tailoredMarkdown,
      keywords: params.keywords as unknown as string[],
      provider: params.provider,
    })
    .returning();
  return rows[0];
}

export async function getVariant(id: number): Promise<CvVariant | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.cvVariants)
    .where(eq(schema.cvVariants.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function listVariantsForJob(jobId: number): Promise<CvVariant[]> {
  const db = getDb();
  return db
    .select()
    .from(schema.cvVariants)
    .where(eq(schema.cvVariants.jobId, jobId))
    .orderBy(desc(schema.cvVariants.createdAt));
}

export async function updateVariant(
  id: number,
  patch: {
    title?: string;
    tailoredMarkdown?: string;
    keywords?: string[];
    theme?: "modern" | "classic";
  },
): Promise<CvVariant> {
  const db = getDb();
  const set: {
    tailoredMarkdown?: string;
    keywords?: Record<string, unknown>;
    theme?: "modern" | "classic";
  } = {};
  if (patch.tailoredMarkdown !== undefined) {
    set.tailoredMarkdown = patch.tailoredMarkdown;
  }
  if (patch.keywords !== undefined) {
    set.keywords = patch.keywords as unknown as Record<string, unknown>;
  }
  if (patch.theme !== undefined) {
    set.theme = patch.theme;
  }
  // Note: cv_variants has no `title` column; `patch.title` is accepted
  // for forward-compat but intentionally not persisted.
  if (Object.keys(set).length === 0) {
    const existing = await getVariant(id);
    if (!existing) throw new Error(`Variant ${id} not found`);
    return existing;
  }
  const rows = await db
    .update(schema.cvVariants)
    .set(set)
    .where(eq(schema.cvVariants.id, id))
    .returning();
  if (rows.length === 0) {
    throw new Error(`Variant ${id} not found`);
  }
  return rows[0];
}

export async function updateVariantPdfPath(
  id: number,
  path: string,
): Promise<CvVariant | null> {
  const db = getDb();
  const rows = await db
    .update(schema.cvVariants)
    .set({ pdfPath: path })
    .where(eq(schema.cvVariants.id, id))
    .returning();
  return rows[0] ?? null;
}

export async function deleteVariant(id: number): Promise<void> {
  const db = getDb();
  await db.delete(schema.cvVariants).where(eq(schema.cvVariants.id, id));
}
