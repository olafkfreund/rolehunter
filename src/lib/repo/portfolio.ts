import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { PortfolioItem } from "@/lib/db/schema";
import type { PortfolioRepoData } from "@/lib/portfolio/github";

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

export async function upsertGithubItems(
  username: string,
  items: PortfolioRepoData[],
): Promise<{ inserted: number; updated: number }> {
  const db = getDb();
  const sourceKey = `github:${username}`;
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
      kind: "github_repo" as const,
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
