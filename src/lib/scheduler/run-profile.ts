// Per-profile execution — fans out across the profile's configured sources,
// writes one search_runs row per (profile × source × tick).
//
// See doc/plans/2026-05-31-rolehunter-v3-design.md §6.3.

import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { SearchProfile } from "@/lib/db/schema";
import { ingestRawJobs } from "@/lib/jobs/ingest";
import {
  budget,
  ensureAdaptersRegistered,
  get as getAdapter,
} from "@/lib/jobs/sources";
import {
  SourceBudgetError,
  SourcePermanentError,
  SourceTransientError,
} from "@/lib/jobs/sources/errors";
import type {
  JobSourceId,
  RemoteMode,
  SearchParams,
} from "@/lib/jobs/sources/types";

const ADAPTER_TIMEOUT_MS = 120_000;

ensureAdaptersRegistered();

function profileToParams(profile: SearchProfile): SearchParams {
  const companies = (profile.companies as string[] | null) ?? [];
  return {
    query: profile.query,
    location: profile.location || undefined,
    locationRadiusKm: profile.locationRadiusKm ?? undefined,
    salaryMinUsd: profile.salaryMinUsd ?? undefined,
    salaryMaxUsd: profile.salaryMaxUsd ?? undefined,
    remoteModes: (profile.remoteModes as RemoteMode[] | null) ?? undefined,
    experienceLevels: (profile.experienceLevels as string[] | null) ?? undefined,
    jobTypes: (profile.jobTypes as string[] | null) ?? undefined,
    maxResults: profile.maxResultsPerRun,
    targetCompanies: companies.length > 0 ? companies : undefined,
  };
}

export async function runProfile(profile: SearchProfile): Promise<void> {
  const sources = (profile.sources as JobSourceId[] | null) ?? [];
  if (sources.length === 0) return;
  await Promise.allSettled(
    sources.map((source) => runProfileSource(profile, source)),
  );
}

async function runProfileSource(
  profile: SearchProfile,
  source: JobSourceId,
): Promise<void> {
  const db = getDb();

  const [run] = await db
    .insert(schema.searchRuns)
    .values({ profileId: profile.id, source, status: "running" })
    .returning({ id: schema.searchRuns.id });
  const runId = run.id;
  const startedAt = Date.now();

  let adapter;
  try {
    adapter = getAdapter(source);
  } catch (err) {
    await finishRun(runId, "failed", Date.now() - startedAt, {
      errorMessage: `adapter '${source}' not registered`,
    });
    return;
  }

  const availability = await adapter.available();
  if (!availability.ok) {
    await finishRun(runId, "failed", Date.now() - startedAt, {
      errorMessage: `unavailable: ${availability.reason}`,
    });
    return;
  }

  const params = profileToParams(profile);
  const estimate = adapter.costEstimate(params);

  if (!(await budget.canSpend(source, estimate))) {
    await finishRun(runId, "skipped_budget", Date.now() - startedAt, {
      errorMessage: "budget_cap_reached",
    });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error("adapter_timeout_120s")),
    ADAPTER_TIMEOUT_MS,
  );

  try {
    const raw = await adapter.search(params, controller.signal);
    const results = await ingestRawJobs(source, raw, {
      searchProfileId: profile.id,
    });
    await budget.recordSpend(source, estimate);

    const newCount = results.filter((r) => r.status === "new").length;
    const dupCount = results.filter((r) => r.status === "merged").length;
    await finishRun(runId, "success", Date.now() - startedAt, {
      jobsFound: raw.length,
      jobsNew: newCount,
      jobsDuplicate: dupCount,
      costUsdEstimate: estimate,
    });
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    if (err instanceof SourceBudgetError) {
      await finishRun(runId, "skipped_budget", durationMs, {
        errorMessage: err.message,
      });
    } else if (err instanceof SourceTransientError) {
      await finishRun(runId, "partial", durationMs, {
        errorMessage: `transient: ${err.message}`,
      });
    } else if (err instanceof SourcePermanentError) {
      await finishRun(runId, "failed", durationMs, {
        errorMessage: `permanent: ${err.message}`,
      });
    } else {
      const msg = err instanceof Error ? err.message : String(err);
      await finishRun(runId, "failed", durationMs, { errorMessage: msg });
    }
  } finally {
    clearTimeout(timer);
  }
}

type RunStatus = "success" | "failed" | "partial" | "skipped_budget";

interface FinishRunOptions {
  jobsFound?: number;
  jobsNew?: number;
  jobsDuplicate?: number;
  costUsdEstimate?: number;
  errorMessage?: string;
}

async function finishRun(
  runId: number,
  status: RunStatus,
  durationMs: number,
  opts: FinishRunOptions = {},
): Promise<void> {
  const db = getDb();
  await db
    .update(schema.searchRuns)
    .set({
      status,
      finishedAt: sql`NOW()`,
      durationMs,
      jobsFound: opts.jobsFound ?? 0,
      jobsNew: opts.jobsNew ?? 0,
      jobsDuplicate: opts.jobsDuplicate ?? 0,
      costUsdEstimate:
        opts.costUsdEstimate != null ? String(opts.costUsdEstimate) : null,
      errorMessage: opts.errorMessage ?? null,
    })
    .where(eq(schema.searchRuns.id, runId));
}
