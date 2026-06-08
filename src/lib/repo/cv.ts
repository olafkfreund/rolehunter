import { and, desc, eq, ne, sql } from "drizzle-orm";
import { unlink } from "node:fs/promises";
import { getDb, schema } from "../db";
import type { CvMaster } from "../db/schema";
import type { CvJson, Provider } from "../llm/types";
import { parseCvText } from "../cv/parse";
import { absoluteUploadPath } from "../upload";
import { cleanNullBytes } from "../utils/clean";


export async function listCvs(): Promise<
  Array<CvMaster & { experienceCount: number; skillsCount: number }>
> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.cvMaster)
    .orderBy(desc(schema.cvMaster.uploadedAt));
  return rows.map((r) => {
    const pj = (r.parsedJson ?? {}) as Record<string, unknown>;
    const experienceCount = Array.isArray(pj.experience) ? pj.experience.length : 0;
    const skillsCount = Array.isArray(pj.skills) ? pj.skills.length : 0;
    return { ...r, experienceCount, skillsCount };
  });
}

export async function getCv(id: number): Promise<CvMaster | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.cvMaster)
    .where(eq(schema.cvMaster.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function getActiveCv(): Promise<CvMaster | null> {
  const db = getDb();
  const activeRows = await db
    .select()
    .from(schema.cvMaster)
    .where(eq(schema.cvMaster.isActive, true))
    .limit(1);
  if (activeRows[0]) return activeRows[0];
  // Fallback: most recently uploaded row.
  const fallback = await db
    .select()
    .from(schema.cvMaster)
    .orderBy(desc(schema.cvMaster.uploadedAt))
    .limit(1);
  return fallback[0] ?? null;
}

/** Legacy alias — kept so older imports (if any) still compile. Prefer getActiveCv. */
export const getLatestCv = getActiveCv;

export async function setActiveCv(id: number): Promise<CvMaster> {
  const db = getDb();
  return await db.transaction(async (tx) => {
    await tx
      .update(schema.cvMaster)
      .set({ isActive: false })
      .where(and(eq(schema.cvMaster.isActive, true), ne(schema.cvMaster.id, id)));
    const updated = await tx
      .update(schema.cvMaster)
      .set({ isActive: true })
      .where(eq(schema.cvMaster.id, id))
      .returning();
    if (!updated[0]) throw new Error(`CV ${id} not found`);
    return updated[0];
  });
}

export async function saveCvMaster(params: {
  title: string;
  rawMarkdown: string;
  parsedJson: CvJson;
  sourceFilePath?: string;
}): Promise<CvMaster> {
  const db = getDb();
  const title = cleanNullBytes(params.title);
  const rawMarkdown = cleanNullBytes(params.rawMarkdown);
  const parsedJson = cleanNullBytes(params.parsedJson);
  return await db.transaction(async (tx) => {
    await tx
      .update(schema.cvMaster)
      .set({ isActive: false })
      .where(eq(schema.cvMaster.isActive, true));
    const rows = await tx
      .insert(schema.cvMaster)
      .values({
        title,
        rawMarkdown,
        parsedJson: parsedJson as unknown as Record<string, unknown>,
        sourceFilePath: params.sourceFilePath,
        isActive: true,
      })
      .returning();
    return rows[0];
  });
}

export async function updateCv(
  id: number,
  patch: { title?: string; rawMarkdown?: string; parsedJson?: CvJson },
): Promise<CvMaster> {
  const db = getDb();
  const sets: Record<string, unknown> = {};
  if (patch.title !== undefined) sets.title = cleanNullBytes(patch.title);
  if (patch.rawMarkdown !== undefined) sets.rawMarkdown = cleanNullBytes(patch.rawMarkdown);
  if (patch.parsedJson !== undefined) {
    sets.parsedJson = cleanNullBytes(patch.parsedJson) as unknown as Record<string, unknown>;
  }
  if (Object.keys(sets).length === 0) {
    const existing = await getCv(id);
    if (!existing) throw new Error(`CV ${id} not found`);
    return existing;
  }
  const rows = await db
    .update(schema.cvMaster)
    .set(sets)
    .where(eq(schema.cvMaster.id, id))
    .returning();
  if (!rows[0]) throw new Error(`CV ${id} not found`);
  return rows[0];
}

export async function deleteCv(id: number): Promise<void> {
  const db = getDb();
  const cv = await getCv(id);
  if (!cv) throw new Error(`CV ${id} not found`);
  if (cv.isActive) throw new Error("Cannot delete the active CV. Activate another first.");
  await db.delete(schema.cvMaster).where(eq(schema.cvMaster.id, id));
  if (cv.sourceFilePath) {
    try {
      await unlink(absoluteUploadPath(cv.sourceFilePath));
    } catch {
      /* file already gone; ignore */
    }
  }
}

export async function reparseCv(id: number, provider?: Provider): Promise<CvMaster> {
  const cv = await getCv(id);
  if (!cv) throw new Error(`CV ${id} not found`);
  const parsed = await parseCvText(cv.rawMarkdown, provider);
  return await updateCv(id, { parsedJson: parsed });
}

export async function cleanupInactiveCvs(): Promise<{ deleted: number }> {
  const db = getDb();
  const active = await getActiveCv();
  if (!active) return { deleted: 0 };
  // Unlink source files before delete for a clean filesystem.
  const doomed = await db
    .select()
    .from(schema.cvMaster)
    .where(sql`${schema.cvMaster.id} <> ${active.id}`);
  for (const row of doomed) {
    if (row.sourceFilePath) {
      try {
        await unlink(absoluteUploadPath(row.sourceFilePath));
      } catch {
        /* ignore */
      }
    }
  }
  const result = await db
    .delete(schema.cvMaster)
    .where(sql`${schema.cvMaster.id} <> ${active.id}`)
    .returning({ id: schema.cvMaster.id });
  return { deleted: result.length };
}
