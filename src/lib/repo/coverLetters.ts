import { desc, eq } from "drizzle-orm";
import { unlink } from "node:fs/promises";
import { getDb, schema } from "@/lib/db";
import type {
  CoverLetter,
  CoverLetterTemplate,
  JobListing,
} from "@/lib/db/schema";
import type { CoverLetterInput, CvJson, Provider, GenerateHooksResult } from "@/lib/llm/types";
import { getProvider } from "@/lib/llm";
import { getActiveCv } from "@/lib/repo/cv";
import { getProfile } from "@/lib/repo/profile";
import { absoluteUploadPath } from "@/lib/upload";

// ---------- Templates ----------

export async function listTemplates(): Promise<CoverLetterTemplate[]> {
  const db = getDb();
  return db
    .select()
    .from(schema.coverLetterTemplates)
    .orderBy(desc(schema.coverLetterTemplates.updatedAt));
}

export async function getTemplate(id: number): Promise<CoverLetterTemplate | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.coverLetterTemplates)
    .where(eq(schema.coverLetterTemplates.id, id))
    .limit(1);
  return rows[0] ?? null;
}

async function findDefaultOrLatestTemplate(): Promise<CoverLetterTemplate | null> {
  const db = getDb();
  const defaults = await db
    .select()
    .from(schema.coverLetterTemplates)
    .where(eq(schema.coverLetterTemplates.isDefault, true))
    .limit(1);
  if (defaults[0]) return defaults[0];
  const latest = await db
    .select()
    .from(schema.coverLetterTemplates)
    .orderBy(desc(schema.coverLetterTemplates.updatedAt))
    .limit(1);
  return latest[0] ?? null;
}

export async function createTemplate(params: {
  name: string;
  bodyMd: string;
  isDefault?: boolean;
}): Promise<CoverLetterTemplate> {
  const db = getDb();
  return await db.transaction(async (tx) => {
    if (params.isDefault) {
      await tx
        .update(schema.coverLetterTemplates)
        .set({ isDefault: false })
        .where(eq(schema.coverLetterTemplates.isDefault, true));
    }
    const rows = await tx
      .insert(schema.coverLetterTemplates)
      .values({
        name: params.name,
        bodyMd: params.bodyMd,
        isDefault: params.isDefault ?? false,
      })
      .returning();
    return rows[0];
  });
}

export async function updateTemplate(
  id: number,
  patch: { name?: string; bodyMd?: string; isDefault?: boolean },
): Promise<CoverLetterTemplate> {
  // If isDefault is being flipped true, route through setDefaultTemplate for the
  // transactional flip, then apply remaining fields.
  if (patch.isDefault === true) {
    await setDefaultTemplate(id);
  }
  const db = getDb();
  const sets: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) sets.name = patch.name;
  if (patch.bodyMd !== undefined) sets.bodyMd = patch.bodyMd;
  if (patch.isDefault === false) sets.isDefault = false;
  const rows = await db
    .update(schema.coverLetterTemplates)
    .set(sets)
    .where(eq(schema.coverLetterTemplates.id, id))
    .returning();
  if (!rows[0]) throw new Error(`Template ${id} not found`);
  return rows[0];
}

export async function deleteTemplate(id: number): Promise<void> {
  const db = getDb();
  await db
    .delete(schema.coverLetterTemplates)
    .where(eq(schema.coverLetterTemplates.id, id));
}

export async function setDefaultTemplate(id: number): Promise<CoverLetterTemplate> {
  const db = getDb();
  return await db.transaction(async (tx) => {
    await tx
      .update(schema.coverLetterTemplates)
      .set({ isDefault: false })
      .where(eq(schema.coverLetterTemplates.isDefault, true));
    const rows = await tx
      .update(schema.coverLetterTemplates)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(eq(schema.coverLetterTemplates.id, id))
      .returning();
    if (!rows[0]) throw new Error(`Template ${id} not found`);
    return rows[0];
  });
}

// ---------- Cover letters ----------

export async function listForApplication(appId: number): Promise<CoverLetter[]> {
  const db = getDb();
  return db
    .select()
    .from(schema.coverLetters)
    .where(eq(schema.coverLetters.applicationId, appId))
    .orderBy(desc(schema.coverLetters.createdAt));
}

export async function getCoverLetter(id: number): Promise<CoverLetter | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.coverLetters)
    .where(eq(schema.coverLetters.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function listRecent(limit = 20): Promise<CoverLetter[]> {
  const db = getDb();
  return db
    .select()
    .from(schema.coverLetters)
    .orderBy(desc(schema.coverLetters.createdAt))
    .limit(limit);
}

export async function createCoverLetter(params: {
  applicationId: number;
  templateId?: number | null;
  provider: Provider;
  generatedMd: string;
  selectedHook?: string | null;
  selectedEvidence?: CoverLetter["selectedEvidence"] | null;
  ctaTone?: string | null;
}): Promise<CoverLetter> {
  const db = getDb();
  const rows = await db
    .insert(schema.coverLetters)
    .values({
      applicationId: params.applicationId,
      templateId: params.templateId ?? null,
      provider: params.provider,
      generatedMd: params.generatedMd,
      selectedHook: params.selectedHook ?? null,
      selectedEvidence: params.selectedEvidence ?? null,
      ctaTone: params.ctaTone ?? null,
    })
    .returning();
  return rows[0];
}

export async function updateCoverLetterPdfPath(
  id: number,
  path: string,
): Promise<CoverLetter | null> {
  const db = getDb();
  const rows = await db
    .update(schema.coverLetters)
    .set({ pdfPath: path })
    .where(eq(schema.coverLetters.id, id))
    .returning();
  return rows[0] ?? null;
}

export async function updateCoverLetter(
  id: number,
  patch: { theme?: "modern" | "classic" },
): Promise<CoverLetter> {
  const db = getDb();
  const set: { theme?: "modern" | "classic" } = {};
  if (patch.theme !== undefined) {
    set.theme = patch.theme;
  }
  if (Object.keys(set).length === 0) {
    const existing = await getCoverLetter(id);
    if (!existing) throw new Error(`Cover letter ${id} not found`);
    return existing;
  }
  const rows = await db
    .update(schema.coverLetters)
    .set(set)
    .where(eq(schema.coverLetters.id, id))
    .returning();
  if (rows.length === 0) {
    throw new Error(`Cover letter ${id} not found`);
  }
  return rows[0];
}

export async function updateCoverLetterTheme(
  id: number,
  theme: "modern" | "classic",
): Promise<CoverLetter> {
  return updateCoverLetter(id, { theme });
}

export async function deleteCoverLetter(id: number): Promise<void> {
  const db = getDb();
  const existing = await getCoverLetter(id);
  if (!existing) return;
  if (existing.pdfPath) {
    try {
      await unlink(absoluteUploadPath(existing.pdfPath));
    } catch {
      /* file already gone; ignore */
    }
  }
  await db.delete(schema.coverLetters).where(eq(schema.coverLetters.id, id));
}

// ---------- Generation ----------

export type CoverLetterJobContext = {
  application: { id: number; jobId: number };
  job: JobListing;
};

async function loadApplicationWithJob(
  appId: number,
): Promise<CoverLetterJobContext> {
  const db = getDb();
  const rows = await db
    .select({
      appId: schema.applications.id,
      jobId: schema.applications.jobId,
      job: schema.jobListings,
    })
    .from(schema.applications)
    .innerJoin(
      schema.jobListings,
      eq(schema.applications.jobId, schema.jobListings.id),
    )
    .where(eq(schema.applications.id, appId))
    .limit(1);
  const row = rows[0];
  if (!row) throw new Error(`Application ${appId} not found`);
  return {
    application: { id: row.appId, jobId: row.jobId },
    job: row.job,
  };
}

export async function generateForApplication(
  appId: number,
  opts: {
    templateId?: number | null;
    provider: Provider;
    selectedHook?: string | null;
    selectedEvidence?: CoverLetter["selectedEvidence"] | null;
    ctaTone?: string | null;
  },
): Promise<CoverLetter> {
  const ctx = await loadApplicationWithJob(appId);
  const [cv, profile] = await Promise.all([getActiveCv(), getProfile()]);
  if (!cv) {
    throw new Error("No active CV. Set one on /profile.");
  }

  let template: CoverLetterTemplate | null = null;
  if (opts.templateId != null) {
    template = await getTemplate(opts.templateId);
    if (!template) throw new Error(`Template ${opts.templateId} not found`);
  } else {
    template = await findDefaultOrLatestTemplate();
  }

  const input: CoverLetterInput = {
    cv: cv.parsedJson as CvJson,
    job: {
      title: ctx.job.title,
      company: ctx.job.company,
      location: ctx.job.location || undefined,
      description: ctx.job.description,
    },
    profile: {
      fullName: profile.fullName,
      email: profile.email,
      phone: profile.phone,
      location: profile.location,
      linkedinUrl: profile.linkedinUrl,
    },
    templateBodyMd: template?.bodyMd,
    selectedHook: opts.selectedHook,
    selectedEvidence: opts.selectedEvidence?.map((e) => e.text) ?? null,
    ctaTone: opts.ctaTone,
  };

  const llm = getProvider(opts.provider);
  const result = await llm.generateCoverLetter(input);

  return createCoverLetter({
    applicationId: appId,
    templateId: template?.id ?? null,
    provider: llm.name,
    generatedMd: result.markdown,
    selectedHook: opts.selectedHook,
    selectedEvidence: opts.selectedEvidence,
    ctaTone: opts.ctaTone,
  });
}

export async function generateHooksForApplication(
  appId: number,
  opts: { provider: Provider },
): Promise<GenerateHooksResult> {
  const ctx = await loadApplicationWithJob(appId);
  const cv = await getActiveCv();
  if (!cv) {
    throw new Error("No active CV. Set one on /profile.");
  }
  const llm = getProvider(opts.provider);
  return llm.generateCoverLetterHooks({
    cv: cv.parsedJson as CvJson,
    job: {
      title: ctx.job.title,
      company: ctx.job.company,
      location: ctx.job.location || undefined,
      description: ctx.job.description,
    },
  });
}
