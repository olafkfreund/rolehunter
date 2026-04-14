import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type {
  CanonicalGap,
  CanonicalGapResource,
} from "@/lib/db/schema";
import { getProvider } from "@/lib/llm";
import type { Provider } from "@/lib/llm/types";

export type LearningStatus = "to_learn" | "learning" | "done" | "dismissed";

export type GapRow = CanonicalGap & {
  sourceCount: number;
  affectedJobTitles: string[];
};

export type GapSourceInfo = {
  matchId: number;
  rawPhrase: string;
  jobId: number;
  jobTitle: string;
  company: string;
};

export type GapDetail = {
  gap: CanonicalGap;
  sources: GapSourceInfo[];
  resources: CanonicalGapResource[];
};

// ---------------------------------------------------------------------------
// Host whitelist for learning resources
// ---------------------------------------------------------------------------

const WHITELIST: Set<string> = new Set([
  "kubernetes.io",
  "cloud.google.com",
  "aws.amazon.com",
  "learn.microsoft.com",
  "docs.microsoft.com",
  "docs.docker.com",
  "developer.mozilla.org",
  "nodejs.org",
  "python.org",
  "docs.python.org",
  "roadmap.sh",
  "refactoring.guru",
  "en.wikipedia.org",
  "github.com",
  "go.dev",
  "rust-lang.org",
  "react.dev",
  "nextjs.org",
  "postgresql.org",
  "redis.io",
  "git-scm.com",
  "kernel.org",
  "freecodecamp.org",
  "opensource.com",
  "spec.commonmark.org",
  "owasp.org",
  "jestjs.io",
  "vitest.dev",
  "playwright.dev",
  "cypress.io",
  "vuejs.org",
  "angular.io",
  "svelte.dev",
  "typescriptlang.org",
  "hashicorp.com",
  "terraform.io",
  "ansible.com",
  "confluent.io",
  "apache.org",
]);

export function isWhitelistedHost(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (WHITELIST.has(host)) return true;
    // Allow subdomains of whitelisted hosts
    for (const w of WHITELIST) {
      if (host === w || host.endsWith(`.${w}`)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function normalizeKey(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

// ---------------------------------------------------------------------------
// List gaps
// ---------------------------------------------------------------------------

export async function listCanonicalGaps(opts?: {
  status?: LearningStatus;
}): Promise<GapRow[]> {
  const db = getDb();

  const baseRows = opts?.status
    ? await db
        .select()
        .from(schema.canonicalGaps)
        .where(eq(schema.canonicalGaps.learningStatus, opts.status))
        .orderBy(desc(schema.canonicalGaps.occurrences), asc(schema.canonicalGaps.name))
    : await db
        .select()
        .from(schema.canonicalGaps)
        .where(
          sql`${schema.canonicalGaps.learningStatus} <> 'dismissed'`,
        )
        .orderBy(desc(schema.canonicalGaps.occurrences), asc(schema.canonicalGaps.name));

  if (baseRows.length === 0) return [];

  const gapIds = baseRows.map((g) => g.id);

  // Aggregate source counts and distinct affected job titles per gap.
  const aggRows = await db
    .select({
      canonicalGapId: schema.canonicalGapSources.canonicalGapId,
      jobTitle: schema.jobListings.title,
      matchId: schema.canonicalGapSources.matchId,
    })
    .from(schema.canonicalGapSources)
    .innerJoin(
      schema.matches,
      eq(schema.matches.id, schema.canonicalGapSources.matchId),
    )
    .innerJoin(
      schema.jobListings,
      eq(schema.jobListings.id, schema.matches.jobId),
    )
    .where(inArray(schema.canonicalGapSources.canonicalGapId, gapIds));

  const byGap = new Map<number, { count: number; titles: Set<string> }>();
  for (const r of aggRows) {
    let entry = byGap.get(r.canonicalGapId);
    if (!entry) {
      entry = { count: 0, titles: new Set<string>() };
      byGap.set(r.canonicalGapId, entry);
    }
    entry.count += 1;
    if (r.jobTitle) entry.titles.add(r.jobTitle);
  }

  return baseRows.map((g) => {
    const entry = byGap.get(g.id);
    return {
      ...g,
      sourceCount: entry?.count ?? 0,
      affectedJobTitles: entry ? Array.from(entry.titles).sort() : [],
    };
  });
}

// ---------------------------------------------------------------------------
// Get one gap (full detail)
// ---------------------------------------------------------------------------

export async function getCanonicalGap(id: number): Promise<GapDetail | null> {
  const db = getDb();

  const gapRows = await db
    .select()
    .from(schema.canonicalGaps)
    .where(eq(schema.canonicalGaps.id, id))
    .limit(1);

  const gap = gapRows[0];
  if (!gap) return null;

  const sourceRows = await db
    .select({
      matchId: schema.canonicalGapSources.matchId,
      rawPhrase: schema.canonicalGapSources.rawPhrase,
      jobId: schema.jobListings.id,
      jobTitle: schema.jobListings.title,
      company: schema.jobListings.company,
    })
    .from(schema.canonicalGapSources)
    .innerJoin(
      schema.matches,
      eq(schema.matches.id, schema.canonicalGapSources.matchId),
    )
    .innerJoin(
      schema.jobListings,
      eq(schema.jobListings.id, schema.matches.jobId),
    )
    .where(eq(schema.canonicalGapSources.canonicalGapId, id))
    .orderBy(desc(schema.canonicalGapSources.createdAt));

  const resources = await db
    .select()
    .from(schema.canonicalGapResources)
    .where(eq(schema.canonicalGapResources.canonicalGapId, id))
    .orderBy(asc(schema.canonicalGapResources.orderIdx));

  return {
    gap,
    sources: sourceRows.map((r) => ({
      matchId: r.matchId,
      rawPhrase: r.rawPhrase,
      jobId: r.jobId,
      jobTitle: r.jobTitle,
      company: r.company,
    })),
    resources,
  };
}

// ---------------------------------------------------------------------------
// Refresh: re-cluster all match gaps into canonical rows
// ---------------------------------------------------------------------------

export async function refreshCanonicalGaps(
  provider: Provider,
): Promise<{ clustersCreated: number; totalMatches: number }> {
  const db = getDb();

  // Load all match gaps (jsonb).
  const matchRows = await db
    .select({
      id: schema.matches.id,
      gaps: schema.matches.gaps,
    })
    .from(schema.matches);

  const flat: { matchId: number; rawPhrase: string }[] = [];
  const matchIdsWithGaps = new Set<number>();

  for (const row of matchRows) {
    const raw = row.gaps;
    let list: string[] = [];
    if (Array.isArray(raw)) {
      list = raw.filter((s): s is string => typeof s === "string" && s.trim().length > 0);
    }
    if (list.length === 0) continue;
    matchIdsWithGaps.add(row.id);
    for (const phrase of list) {
      flat.push({ matchId: row.id, rawPhrase: phrase.trim() });
    }
  }

  if (flat.length === 0) {
    return { clustersCreated: 0, totalMatches: 0 };
  }

  const llm = getProvider(provider);
  const { clusters } = await llm.canonicalizeGaps(flat);

  if (clusters.length === 0) {
    return { clustersCreated: 0, totalMatches: matchIdsWithGaps.size };
  }

  const affectedMatchIds = Array.from(matchIdsWithGaps);

  await db.transaction(async (tx) => {
    // Remove existing sources for these matches so we can rebuild cleanly.
    if (affectedMatchIds.length > 0) {
      await tx
        .delete(schema.canonicalGapSources)
        .where(inArray(schema.canonicalGapSources.matchId, affectedMatchIds));
    }

    const now = new Date();

    for (const cluster of clusters) {
      const normalizedKey =
        cluster.normalizedKey?.trim() || normalizeKey(cluster.canonicalName);
      if (!normalizedKey) continue;

      // Upsert: preserve existing learningStatus and resourcesFetchedAt.
      const existing = await tx
        .select()
        .from(schema.canonicalGaps)
        .where(eq(schema.canonicalGaps.normalizedKey, normalizedKey))
        .limit(1);

      let gapId: number;
      if (existing[0]) {
        const updated = await tx
          .update(schema.canonicalGaps)
          .set({
            name: cluster.canonicalName,
            description: cluster.description ?? "",
            lastClusteredAt: now,
            occurrences: cluster.members.length,
            updatedAt: now,
          })
          .where(eq(schema.canonicalGaps.id, existing[0].id))
          .returning({ id: schema.canonicalGaps.id });
        gapId = updated[0].id;
      } else {
        const inserted = await tx
          .insert(schema.canonicalGaps)
          .values({
            name: cluster.canonicalName,
            normalizedKey,
            description: cluster.description ?? "",
            learningStatus: "to_learn",
            occurrences: cluster.members.length,
            lastClusteredAt: now,
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: schema.canonicalGaps.id });
        gapId = inserted[0].id;
      }

      // Insert the members as sources. Use onConflictDoNothing via the unique
      // index (canonical_gap_id, match_id, raw_phrase).
      const seen = new Set<string>();
      for (const m of cluster.members) {
        if (!m || typeof m.matchId !== "number") continue;
        const phrase = (m.rawPhrase ?? "").trim();
        if (!phrase) continue;
        const dedupKey = `${m.matchId}::${phrase}`;
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);
        await tx
          .insert(schema.canonicalGapSources)
          .values({
            canonicalGapId: gapId,
            matchId: m.matchId,
            rawPhrase: phrase,
          })
          .onConflictDoNothing();
      }
    }

    // Recompute occurrences from the actual source rows per gap so drift
    // from dedup / phantom inserts stays fixed.
    await tx.execute(sql`
      UPDATE canonical_gaps g
      SET occurrences = COALESCE(s.cnt, 0)
      FROM (
        SELECT canonical_gap_id, COUNT(*)::int AS cnt
        FROM canonical_gap_sources
        GROUP BY canonical_gap_id
      ) s
      WHERE s.canonical_gap_id = g.id
    `);
  });

  return {
    clustersCreated: clusters.length,
    totalMatches: matchIdsWithGaps.size,
  };
}

// ---------------------------------------------------------------------------
// Status updates
// ---------------------------------------------------------------------------

export async function setLearningStatus(
  id: number,
  status: LearningStatus,
): Promise<CanonicalGap> {
  const db = getDb();
  const updated = await db
    .update(schema.canonicalGaps)
    .set({ learningStatus: status, updatedAt: new Date() })
    .where(eq(schema.canonicalGaps.id, id))
    .returning();
  if (!updated[0]) throw new Error(`Canonical gap ${id} not found`);
  return updated[0];
}

export async function dismissGap(id: number): Promise<CanonicalGap> {
  return setLearningStatus(id, "dismissed");
}

// ---------------------------------------------------------------------------
// Resource generation
// ---------------------------------------------------------------------------

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

export async function fetchResourcesForGap(
  id: number,
  provider: Provider,
): Promise<CanonicalGapResource[]> {
  const db = getDb();

  const gapRows = await db
    .select()
    .from(schema.canonicalGaps)
    .where(eq(schema.canonicalGaps.id, id))
    .limit(1);

  const gap = gapRows[0];
  if (!gap) throw new Error(`Canonical gap ${id} not found`);

  // Cache check.
  if (gap.resourcesFetchedAt) {
    const age = Date.now() - gap.resourcesFetchedAt.getTime();
    if (age < FOURTEEN_DAYS_MS) {
      const existing = await db
        .select()
        .from(schema.canonicalGapResources)
        .where(eq(schema.canonicalGapResources.canonicalGapId, id))
        .orderBy(asc(schema.canonicalGapResources.orderIdx));
      if (existing.length > 0) return existing;
    }
  }

  const llm = getProvider(provider);
  const { resources } = await llm.generateLearningResources(gap.name);

  const filtered = resources.filter(
    (r) => typeof r?.url === "string" && isWhitelistedHost(r.url),
  );

  return db.transaction(async (tx) => {
    await tx
      .delete(schema.canonicalGapResources)
      .where(eq(schema.canonicalGapResources.canonicalGapId, id));

    const now = new Date();
    const inserted: CanonicalGapResource[] = [];

    if (filtered.length > 0) {
      const rows = await tx
        .insert(schema.canonicalGapResources)
        .values(
          filtered.map((r, idx) => ({
            canonicalGapId: id,
            title: r.title,
            url: r.url,
            kind: r.kind,
            rationale: r.rationale ?? "",
            orderIdx: idx,
            provider: llm.name,
            createdAt: now,
          })),
        )
        .returning();
      inserted.push(...rows);
    }

    await tx
      .update(schema.canonicalGaps)
      .set({ resourcesFetchedAt: now, updatedAt: now })
      .where(eq(schema.canonicalGaps.id, id));

    return inserted;
  });
}

