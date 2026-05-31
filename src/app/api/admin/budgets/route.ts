// GET /api/admin/budgets — current state of per-source monthly USD budgets
// and per-source daily call quotas.
//
// Response shape:
//   {
//     monthYear: 'YYYY-MM',
//     today: 'YYYY-MM-DD',
//     monthly: Array<{
//       source: string,
//       monthYear: string,
//       usageCount: number,
//       estimatedSpendUsd: number,
//       monthlyCapUsd: number,
//       capPercent: number,   // 0-100
//     }>,
//     daily: Array<{
//       source: JobSourceId,
//       day: string,
//       usageCount: number,
//       dailyCap: number,
//       capPercent: number,
//     }>,
//   }
//
// See doc/plans/2026-05-31-rolehunter-v3-design.md §9.5.

import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { wrap } from "@/lib/api";
import { getDb, schema } from "@/lib/db";

export const runtime = "nodejs";

function currentMonthYear(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function currentDay(): string {
  return new Date().toISOString().slice(0, 10);
}

function percent(numerator: number, denominator: number): number {
  if (!Number.isFinite(denominator) || denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export const GET = wrap(async () => {
  const db = getDb();
  const monthYear = currentMonthYear();
  const today = currentDay();

  const monthlyRows = await db
    .select()
    .from(schema.sourceBudgets)
    .where(eq(schema.sourceBudgets.monthYear, monthYear));

  const dailyRows = await db
    .select()
    .from(schema.sourceQuotasDaily)
    .where(sql`${schema.sourceQuotasDaily.day} = CURRENT_DATE`);

  const monthly = monthlyRows.map((row) => {
    const spend = Number(row.estimatedSpendUsd);
    const cap = Number(row.monthlyCapUsd);
    return {
      source: row.source,
      monthYear: row.monthYear,
      usageCount: row.usageCount,
      estimatedSpendUsd: spend,
      monthlyCapUsd: cap,
      capPercent: percent(spend, cap),
    };
  });

  const daily = dailyRows.map((row) => ({
    source: row.source,
    day: row.day,
    usageCount: row.usageCount,
    dailyCap: row.dailyCap,
    capPercent: percent(row.usageCount, row.dailyCap),
  }));

  return NextResponse.json({
    monthYear,
    today,
    monthly,
    daily,
  });
});
