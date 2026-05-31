// Budget gates for adapter calls. Uses source_budgets (monthly USD) and
// source_quotas_daily (daily call count) tables added in v3.0 migration 0006.
// See doc/plans/2026-05-31-rolehunter-v3-design.md §9.3.

import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { sourceBudgets, sourceQuotasDaily, jobSourceEnum } from "@/lib/db/schema";
import { dailyCallCapFor, monthlyCapFor } from "./pricing";
import type { BudgetKey } from "./pricing";
import type { JobSourceId } from "./types";

function currentMonthYear(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function currentDay(): string {
  return new Date().toISOString().slice(0, 10);
}

const DAILY_QUOTA_SOURCES: JobSourceId[] = ["adzuna"];

function isDailyQuotaSource(source: BudgetKey): source is JobSourceId {
  return DAILY_QUOTA_SOURCES.includes(source as JobSourceId);
}

export const budget = {
  async canSpend(source: BudgetKey, projectedUsd: number): Promise<boolean> {
    if (isDailyQuotaSource(source)) {
      return checkDailyQuota(source);
    }
    const cap = monthlyCapFor(source);
    if (!Number.isFinite(cap)) return true;
    if (cap <= 0) return true;
    const db = getDb();
    const row = await getOrCreateBudgetRow(db, source, cap);
    return Number(row.estimatedSpendUsd) + projectedUsd <= cap;
  },

  async recordSpend(source: BudgetKey, usd: number): Promise<void> {
    if (isDailyQuotaSource(source)) {
      await recordDailyCall(source);
      return;
    }
    const monthYear = currentMonthYear();
    const db = getDb();
    await db
      .update(sourceBudgets)
      .set({
        usageCount: sql`${sourceBudgets.usageCount} + 1`,
        estimatedSpendUsd: sql`${sourceBudgets.estimatedSpendUsd} + ${usd}`,
        updatedAt: sql`NOW()`,
      })
      .where(and(eq(sourceBudgets.source, source), eq(sourceBudgets.monthYear, monthYear)));
  },
};

type Db = ReturnType<typeof getDb>;

async function getOrCreateBudgetRow(db: Db, source: BudgetKey, cap: number) {
  const monthYear = currentMonthYear();
  const existing = await db
    .select()
    .from(sourceBudgets)
    .where(and(eq(sourceBudgets.source, source), eq(sourceBudgets.monthYear, monthYear)))
    .limit(1);
  if (existing.length > 0) return existing[0];
  const [inserted] = await db
    .insert(sourceBudgets)
    .values({
      source,
      monthYear,
      usageCount: 0,
      estimatedSpendUsd: "0",
      monthlyCapUsd: String(cap),
    })
    .returning();
  return inserted;
}

async function checkDailyQuota(source: JobSourceId): Promise<boolean> {
  const cap = dailyCallCapFor(source);
  if (!Number.isFinite(cap)) return true;
  const day = currentDay();
  const db = getDb();
  const existing = await db
    .select()
    .from(sourceQuotasDaily)
    .where(and(eq(sourceQuotasDaily.source, source), eq(sourceQuotasDaily.day, day)))
    .limit(1);
  if (existing.length === 0) return true;
  return existing[0].usageCount < cap;
}

async function recordDailyCall(source: JobSourceId): Promise<void> {
  const day = currentDay();
  const cap = dailyCallCapFor(source);
  const dailyCap = Number.isFinite(cap) ? cap : 0;
  const db = getDb();
  const existing = await db
    .select()
    .from(sourceQuotasDaily)
    .where(and(eq(sourceQuotasDaily.source, source), eq(sourceQuotasDaily.day, day)))
    .limit(1);
  if (existing.length === 0) {
    await db.insert(sourceQuotasDaily).values({
      source,
      day,
      usageCount: 1,
      dailyCap,
    });
    return;
  }
  await db
    .update(sourceQuotasDaily)
    .set({ usageCount: sql`${sourceQuotasDaily.usageCount} + 1` })
    .where(and(eq(sourceQuotasDaily.source, source), eq(sourceQuotasDaily.day, day)));
}

// Silence unused-import warning for the enum (it's used by the schema types).
void jobSourceEnum;
