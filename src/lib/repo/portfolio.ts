import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { PortfolioItem } from "@/lib/db/schema";
import type { PortfolioRepoData } from "@/lib/portfolio/github";

export type PortfolioKind =
  | "github_repo"
  | "gitlab_repo"
  | "blog_post"
  | "website"
  | "obsidian_note"
  | "manual_project"
  | "manual_skill"
  | "manual_role";

export interface ManualPortfolioInput {
  kind: "manual_project" | "manual_skill" | "manual_role";
  title: string;
  description?: string;
  url?: string | null;
  tech?: string[];
  highlights?: string[];
  role?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
}

export interface PortfolioSourceSummary {
  sourceKey: string;
  kind: PortfolioKind;
  itemCount: number;
  hiddenCount: number;
  lastSyncedAt: Date | null;
}

export async function listPortfolioItems(opts: { kind?: string } = {}): Promise<PortfolioItem[]> {
  const db = getDb();
  if (opts.kind) {
    return db
      .select()
      .from(schema.portfolioItems)
      .where(eq(schema.portfolioItems.kind, opts.kind as never))
      .orderBy(desc(schema.portfolioItems.syncedAt));
  }
  return db
    .select()
    .from(schema.portfolioItems)
    .orderBy(desc(schema.portfolioItems.syncedAt));
}

export async function upsertRepoItems(
  sourceKey: string,
  kind: "github_repo" | "gitlab_repo" | "blog_post" | "website",
  items: PortfolioRepoData[],
): Promise<{ inserted: number; updated: number }> {
  const db = getDb();
  let inserted = 0;
  let updated = 0;

  for (const it of items) {
    const existing = await db
      .select({ id: schema.portfolioItems.id })
      .from(schema.portfolioItems)
      .where(
        and(
          eq(schema.portfolioItems.sourceKey, sourceKey),
          eq(schema.portfolioItems.externalId, it.externalId),
        ),
      )
      .limit(1);

    const values = {
      kind,
      sourceKey,
      externalId: it.externalId,
      title: it.title,
      description: it.description,
      url: it.url,
      tech: it.tech,
      highlights: it.highlights,
      stars: it.stars,
      startedAt: it.startedAt ? new Date(it.startedAt) : null,
      endedAt: it.endedAt ? new Date(it.endedAt) : null,
      rawJson: it.rawJson as Record<string, unknown>,
      syncedAt: new Date(),
    };

    if (existing.length > 0) {
      await db
        .update(schema.portfolioItems)
        .set({
          ...values,
          updatedAt: sql`NOW()` as unknown as Date,
        })
        .where(eq(schema.portfolioItems.id, existing[0].id));
      updated++;
    } else {
      await db.insert(schema.portfolioItems).values(values);
      inserted++;
    }
  }

  return { inserted, updated };
}

// Back-compat for existing /api/portfolio/sync-github callers.
export async function upsertGithubItems(
  username: string,
  items: PortfolioRepoData[],
): Promise<{ inserted: number; updated: number }> {
  return upsertRepoItems(`github:${username}`, "github_repo", items);
}

export async function upsertGitlabItems(
  username: string,
  items: PortfolioRepoData[],
): Promise<{ inserted: number; updated: number }> {
  return upsertRepoItems(`gitlab:${username}`, "gitlab_repo", items);
}

export async function upsertWebItem(
  kind: "blog_post" | "website",
  item: PortfolioRepoData,
): Promise<{ inserted: number; updated: number }> {
  let host = "unknown";
  try {
    host = new URL(item.url).host;
  } catch {
    // keep "unknown"
  }
  const sourceKey = `${kind === "blog_post" ? "blog" : "web"}:${host}`;
  return upsertRepoItems(sourceKey, kind, [item]);
}

export async function createManualItem(input: ManualPortfolioInput): Promise<PortfolioItem> {
  const db = getDb();
  const externalId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const sourceKey = `manual:${input.kind}`;

  const [row] = await db
    .insert(schema.portfolioItems)
    .values({
      kind: input.kind,
      sourceKey,
      externalId,
      title: input.title,
      description: input.description ?? "",
      url: input.url ?? null,
      tech: input.tech ?? [],
      highlights: input.highlights ?? [],
      role: input.role ?? null,
      startedAt: input.startedAt ? new Date(input.startedAt) : null,
      endedAt: input.endedAt ? new Date(input.endedAt) : null,
      stars: null,
      rawJson: null,
      syncedAt: new Date(),
    })
    .returning();

  return row;
}

export async function updateManualItem(
  id: number,
  patch: Partial<ManualPortfolioInput>,
): Promise<PortfolioItem | null> {
  const db = getDb();
  const set: Record<string, unknown> = {
    updatedAt: sql`NOW()` as unknown as Date,
  };
  if (patch.title !== undefined) set.title = patch.title;
  if (patch.description !== undefined) set.description = patch.description;
  if (patch.url !== undefined) set.url = patch.url;
  if (patch.tech !== undefined) set.tech = patch.tech;
  if (patch.highlights !== undefined) set.highlights = patch.highlights;
  if (patch.role !== undefined) set.role = patch.role;
  if (patch.startedAt !== undefined)
    set.startedAt = patch.startedAt ? new Date(patch.startedAt) : null;
  if (patch.endedAt !== undefined)
    set.endedAt = patch.endedAt ? new Date(patch.endedAt) : null;

  const [row] = await db
    .update(schema.portfolioItems)
    .set(set)
    .where(eq(schema.portfolioItems.id, id))
    .returning();
  return row ?? null;
}

export async function listSources(): Promise<PortfolioSourceSummary[]> {
  const db = getDb();
  const rows = await db
    .select({
      sourceKey: schema.portfolioItems.sourceKey,
      kind: schema.portfolioItems.kind,
      itemCount: sql<number>`COUNT(*)::int`,
      hiddenCount: sql<number>`SUM(CASE WHEN ${schema.portfolioItems.hidden} THEN 1 ELSE 0 END)::int`,
      lastSyncedAt: sql<Date | null>`MAX(${schema.portfolioItems.syncedAt})`,
    })
    .from(schema.portfolioItems)
    .groupBy(schema.portfolioItems.sourceKey, schema.portfolioItems.kind)
    .orderBy(desc(sql`MAX(${schema.portfolioItems.syncedAt})`));

  return rows.map((r) => ({
    sourceKey: r.sourceKey,
    kind: r.kind as PortfolioKind,
    itemCount: Number(r.itemCount),
    hiddenCount: Number(r.hiddenCount ?? 0),
    lastSyncedAt: r.lastSyncedAt ? new Date(r.lastSyncedAt) : null,
  }));
}

export async function deleteSource(sourceKey: string): Promise<number> {
  const db = getDb();
  const result = await db
    .delete(schema.portfolioItems)
    .where(eq(schema.portfolioItems.sourceKey, sourceKey))
    .returning({ id: schema.portfolioItems.id });
  return result.length;
}

export async function deletePortfolioItem(id: number): Promise<boolean> {
  const db = getDb();
  const result = await db
    .delete(schema.portfolioItems)
    .where(eq(schema.portfolioItems.id, id))
    .returning({ id: schema.portfolioItems.id });
  return result.length > 0;
}

export async function toggleHidden(id: number, hidden: boolean): Promise<PortfolioItem | null> {
  const db = getDb();
  const [row] = await db
    .update(schema.portfolioItems)
    .set({ hidden, updatedAt: sql`NOW()` as unknown as Date })
    .where(eq(schema.portfolioItems.id, id))
    .returning();
  return row ?? null;
}
