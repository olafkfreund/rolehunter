# RoleHunter v3.0 — Design

> Created: 2026-05-31
> Status: Approved
> Tracking epic: [#28](https://github.com/olafkfreund/rolehunter/issues/28)
> Future epics: [#42](https://github.com/olafkfreund/rolehunter/issues/42) v3.1 · [#43](https://github.com/olafkfreund/rolehunter/issues/43) v3.2 · [#44](https://github.com/olafkfreund/rolehunter/issues/44) v3.3 · [#45](https://github.com/olafkfreund/rolehunter/issues/45) v3.4 · [#46](https://github.com/olafkfreund/rolehunter/issues/46) v3.5

## 1. Overview

RoleHunter v3.0 — **"The job firehose, ranked."** A scheduled multi-source aggregation layer that turns RoleHunter from a manual single-search tool into a continuously-updating ranked stream of jobs scored against the user's active CV.

The v2.4 codebase already has: per-job match scoring, CV upload/parse, tailored CV generation, cover letter generation, application tracking, interview tracking, gap clustering, LinkedIn SEO, and dual LLM provider support (Claude + Gemini). What's missing is **breadth of data** and **automation**. v3.0 is the foundation: more sources, scheduled fetching, ranked feed. v3.1–v3.5 build on it.

Cost target: ~$10/month total, dominated by ~$5/mo Apify on-demand and ~$5/mo LLM auto-scoring. Falls to ~$1/mo on Gemini Flash provider.

## 2. Goals & non-goals

### Goals

1. **Breadth**: 5 new job sources (Adzuna, Indeed official MCP, Dice MCP, ts-jobspy, Apify) on top of existing JSearch + LinkedIn-JSearch + manual paste — 8 total.
2. **Automation**: saved-search profiles run on a schedule (hourly to weekly).
3. **Personalization**: every freshly-ingested job is auto-scored against the active CV at ingest using the existing `match()` LLM function.
4. **Quality**: cross-source dedupe via fuzzy hash; multi-source listings merged into a single row with `sources_seen` tracking.
5. **Cost rails**: per-source monthly/daily budgets, fail-open when caps hit, env-configurable, observable.
6. **No regression**: existing v2.4 paths (manual paste, JSearch, LinkedIn-JSearch one-shot search, all downstream UI) preserved bit-for-bit, refactored to the new adapter interface under the hood.

### Non-goals (deferred to v3.1+)

- CV embeddings / pgvector reranking — v3.1
- Skill graph extracted from CV + GitHub + LinkedIn — v3.1
- Stretch-match classifier — v3.1
- Company enrichment (Glassdoor reviews, layoffs, news, employee mentions) — v3.2
- ATS-aware tailoring engine, form-field generation, pre-flight ATS score — v3.3
- Mock interviews, spaced repetition gap drills, per-company behavioral banks — v3.4
- Notifications (email/webhook), offer tracking, salary negotiation log — v3.5
- Multi-user / authentication — never (single-user mission preserved)

## 3. Architecture

All new code lives in the existing Next.js app container. No new services, no Python runtime, no message broker. The scheduler runs in-process via `node-cron` registered in `instrumentation.ts`. Postgres advisory locks guard against dev-mode hot-reload double-fires.

```
                  ┌──────────────────────────────────────────┐
                  │           Next.js app container          │
                  │                                          │
                  │  ┌─────────┐    ┌──────────────────┐     │
   browser ───►   │  │  HTTP   │    │   node-cron      │     │
                  │  │ routes  │    │   (every 60s)    │     │
                  │  └────┬────┘    └────────┬─────────┘     │
                  │       │                  │               │
                  │       ▼                  ▼               │
                  │  ┌─────────────────────────────────┐     │
                  │  │  JobSource adapter registry     │     │
                  │  │   adzuna · indeed · dice ·      │     │
                  │  │   jobspy · apify · jsearch ·    │     │
                  │  │   linkedin · paste              │     │
                  │  └──────────────┬──────────────────┘     │
                  │                 ▼                        │
                  │  ┌─────────────────────────────────┐     │
                  │  │ Ingest pipeline                 │     │
                  │  │  normalize → dedupe → upsert    │     │
                  │  │  → enqueue match() per job      │     │
                  │  └──────────────┬──────────────────┘     │
                  └─────────────────┼────────────────────────┘
                                    ▼
                  ┌────────────────────────────────────────┐
                  │  Postgres 16 + pgvector                │
                  │  job_listings (extended)               │
                  │  matches (existing)                    │
                  │  search_profiles, search_runs,         │
                  │  source_budgets, source_quotas_daily   │
                  └────────────────────────────────────────┘
```

## 4. Schema changes

Three new tables + one for daily quotas + five new columns on `job_listings` + one enum extension. All additive; no destructive changes to v2.4 data.

### 4.0 PK strategy

**All new tables use `serial` integer primary keys, consistent with v2.4.** The existing v2.4 schema (`src/lib/db/schema.ts`) defines `job_listings.id`, `matches.id`, `cv_master.id`, etc. as `serial`. The original draft used `uuid` for new tables; that would have created an FK type mismatch on `job_listings.search_profile_id`. Snippets below are corrected.

Where the spec previously showed `uuid('id').defaultRandom().primaryKey()`, read it as `serial('id').primaryKey()`. Where it showed FK columns as `uuid('foo_id').references(...)`, read them as `integer('foo_id').references(...)`. `search_runs.id` stays `serial`; `crypto.randomUUID()` in scheduler snippets becomes a `serial`-backed `INSERT ... RETURNING id` pattern.

### 4.1 `search_profiles`

User-saved searches the scheduler fans out across selected sources.

```ts
export const profileFrequencyEnum = pgEnum('profile_frequency',
  ['hourly', 'every_4h', 'daily', 'weekly']);

export const searchProfiles = pgTable('search_profiles', {
  id:                  serial('id').primaryKey(),
  name:                varchar('name', { length: 120 }).notNull(),
  query:               text('query').notNull(),
  location:            varchar('location', { length: 200 }),
  locationRadiusKm:    integer('location_radius_km'),
  salaryMinUsd:        integer('salary_min_usd'),
  salaryMaxUsd:        integer('salary_max_usd'),
  salaryCurrency:      varchar('salary_currency', { length: 8 }).default('USD'),
  remoteModes:         jsonb('remote_modes').$type<('remote'|'hybrid'|'onsite')[]>().default([]),
  experienceLevels:    jsonb('experience_levels').$type<string[]>().default([]),
  jobTypes:            jsonb('job_types').$type<string[]>().default([]),
  sources:             jsonb('sources').$type<JobSourceId[]>().notNull(),
  frequency:           profileFrequencyEnum('frequency').notNull().default('daily'),
  maxResultsPerRun:    integer('max_results_per_run').notNull().default(50),
  active:              boolean('active').notNull().default(true),
  nextRunAt:           timestamp('next_run_at').notNull().defaultNow(),
  lastRunAt:           timestamp('last_run_at'),
  createdAt:           timestamp('created_at').notNull().defaultNow(),
  updatedAt:           timestamp('updated_at').notNull().defaultNow(),
}, t => ({
  schedulerHotPath: index('idx_profiles_due').on(t.active, t.nextRunAt),
}));
```

The scheduler's hot path — `WHERE active AND next_run_at <= NOW()` — is the only query that runs every 60s; it gets a dedicated composite index.

### 4.2 `search_runs`

One row per (profile × source × tick). Drives run-history UI and observability.

```ts
export const searchRunStatusEnum = pgEnum('search_run_status',
  ['running', 'success', 'failed', 'partial', 'skipped_budget']);

export const searchRuns = pgTable('search_runs', {
  id:                  serial('id').primaryKey(),
  profileId:           integer('profile_id').references(() => searchProfiles.id, { onDelete: 'cascade' }).notNull(),
  source:              jobSourceEnum('source').notNull(),
  status:              searchRunStatusEnum('status').notNull().default('running'),
  startedAt:           timestamp('started_at').notNull().defaultNow(),
  finishedAt:          timestamp('finished_at'),
  durationMs:          integer('duration_ms'),
  jobsFound:           integer('jobs_found').notNull().default(0),
  jobsNew:             integer('jobs_new').notNull().default(0),
  jobsDuplicate:       integer('jobs_duplicate').notNull().default(0),
  jobsFailedScore:     integer('jobs_failed_score').notNull().default(0),
  costUsdEstimate:     numeric('cost_usd_estimate', { precision: 10, scale: 4 }),
  errorMessage:        text('error_message'),
}, t => ({
  byProfile: index('idx_runs_profile').on(t.profileId, t.startedAt.desc()),
  byStatus:  index('idx_runs_status').on(t.status),
}));
```

### 4.3 `source_budgets`

Monthly spend tracking per source.

```ts
export const sourceBudgets = pgTable('source_budgets', {
  id:                  serial('id').primaryKey(),
  source:              text('source').notNull(),                          // job_source enum OR 'auto_score'
  monthYear:           varchar('month_year', { length: 7 }).notNull(),    // '2026-05'
  usageCount:          integer('usage_count').notNull().default(0),
  estimatedSpendUsd:   numeric('estimated_spend_usd', { precision: 10, scale: 4 }).notNull().default('0'),
  monthlyCapUsd:       numeric('monthly_cap_usd', { precision: 10, scale: 4 }).notNull(),
  createdAt:           timestamp('created_at').notNull().defaultNow(),
  updatedAt:           timestamp('updated_at').notNull().defaultNow(),
}, t => ({
  uniqByMonth: uniqueIndex('uniq_source_month').on(t.source, t.monthYear),
}));
```

`source` is `text` not the enum because `auto_score` is a synthetic budget key not present in `job_source`.

### 4.4 `source_quotas_daily`

Daily-quota variant (used for Adzuna's 250/day free quota).

```ts
export const sourceQuotasDaily = pgTable('source_quotas_daily', {
  id:         serial('id').primaryKey(),
  source:     jobSourceEnum('source').notNull(),
  day:        date('day').notNull(),
  usageCount: integer('usage_count').notNull().default(0),
  dailyCap:   integer('daily_cap').notNull(),
}, t => ({ uniq: uniqueIndex('uniq_source_day').on(t.source, t.day) }));
```

### 4.5 `job_listings` extensions

Five additive columns. All have safe defaults; existing rows survive untouched.

```ts
// ...existing columns preserved...
dedupeHash:          text('dedupe_hash'),
sourcesSeen:         jsonb('sources_seen').$type<SourceSighting[]>().default([]),
fetchedAt:           timestamp('fetched_at').notNull().defaultNow(),
topScore:            smallint('top_score'),
searchProfileId:     integer('search_profile_id').references(() => searchProfiles.id, { onDelete: 'set null' }),

// indexes
byScoreThenRecent:   index('idx_jobs_feed').on(t.topScore.desc(), t.fetchedAt.desc()),
byDedupe:            index('idx_jobs_dedupe').on(t.dedupeHash),
byRecent:            index('idx_jobs_fetched').on(t.fetchedAt.desc()),
byProfile:           index('idx_jobs_profile').on(t.searchProfileId),

type SourceSighting = {
  source: JobSourceId;
  externalId: string;
  url: string;
  fetchedAt: string;            // ISO
};
```

### 4.6 Enum extension

```sql
ALTER TYPE job_source ADD VALUE IF NOT EXISTS 'adzuna';
ALTER TYPE job_source ADD VALUE IF NOT EXISTS 'indeed';
ALTER TYPE job_source ADD VALUE IF NOT EXISTS 'dice';
ALTER TYPE job_source ADD VALUE IF NOT EXISTS 'jobspy';
ALTER TYPE job_source ADD VALUE IF NOT EXISTS 'apify';
```

Existing values (`paste`, `jsearch`, `linkedin`) preserved.

**Drizzle enum sync (do not skip):** the raw SQL above adds values at the Postgres level, but Drizzle's `pgEnum()` declaration in `schema.ts` must be updated in the same commit. Otherwise the next `drizzle-kit generate` will emit a migration that drops the new values. The schema declaration becomes:

```ts
// src/lib/db/schema.ts
export const jobSourceEnum = pgEnum('job_source',
  ['paste', 'jsearch', 'linkedin', 'adzuna', 'indeed', 'dice', 'jobspy', 'apify']);
```

The Drizzle change ships with migration 0006; the runtime SQL and the schema declaration must move together.

### 4.7 Decision: merge on dedupe (vs separate rows)

When the same job comes from multiple sources, we merge into a single row and append to `sources_seen`. First-write wins on description/salary. This keeps the ranked feed clean ("Senior SRE at Acme" shows once with three source chips) and makes `sources_seen.length > 1` a quality signal.

The cost is that per-source salary discrepancies are lost. Acceptable; salary is rarely the deciding factor and we have the URL to the original posting.

## 5. JobSource adapter framework

### 5.1 File layout

```
src/lib/jobs/
  ├── sources/
  │   ├── types.ts             # JobSource interface, RawJob, SearchParams
  │   ├── registry.ts          # build adapter map at boot
  │   ├── normalize.ts         # RawJob → job_listings row (pure)
  │   ├── dedupe.ts            # dedupe_hash computation
  │   ├── budget.ts            # source_budgets read/write helpers
  │   ├── pricing.ts           # per-source pricing table + env overrides
  │   ├── jsearch.ts           # existing, refactored to adapter
  │   ├── linkedin-jsearch.ts  # existing, refactored
  │   ├── adzuna.ts            # NEW
  │   ├── indeed-mcp.ts        # NEW
  │   ├── dice-mcp.ts          # NEW
  │   ├── jobspy.ts            # NEW (ts-jobspy library)
  │   └── apify.ts             # NEW (Apify HTTP API)
  ├── ingest.ts                # normalize → dedupe → upsert → enqueue score
  └── score-queue.ts           # in-memory async queue for match() calls
```

### 5.2 Core interface

```ts
export type JobSourceId =
  | 'jsearch' | 'linkedin'                                      // existing
  | 'adzuna' | 'indeed' | 'dice' | 'jobspy' | 'apify'           // new
  | 'paste';                                                    // manual

export interface JobSource {
  id: JobSourceId;
  displayName: string;
  available(): Promise<{ ok: true } | { ok: false; reason: string }>;
  costEstimate(params: SearchParams): number;
  search(params: SearchParams, signal: AbortSignal): Promise<RawJob[]>;
}

export interface SearchParams {
  query: string;
  location?: string;
  locationRadiusKm?: number;
  salaryMinUsd?: number;
  salaryMaxUsd?: number;
  remoteModes?: ('remote' | 'hybrid' | 'onsite')[];
  experienceLevels?: string[];
  jobTypes?: string[];
  maxResults: number;
  countryHint?: string;
}

export interface RawJob {
  externalId: string;
  title: string;
  company: string;
  companyUrl?: string;
  location?: { city?: string; region?: string; country?: string; raw?: string };
  remoteMode?: 'remote' | 'hybrid' | 'onsite';
  description: string;
  salary?: { min?: number; max?: number; currency: string; period?: 'year' | 'month' | 'hour' };
  jobType?: string;
  experienceLevel?: string;
  postedAt?: string;
  url: string;
  rawSource: unknown;
}
```

### 5.3 Adapter execution lifecycle

```
adapter.available()        → ok?  no → mark skipped
↓
budget.canSpend(source)    → ok?  no → mark skipped_budget
↓
AbortController(120s)
↓
adapter.search(...)        → throws? → SourceTransient | Permanent | Budget
↓
budget.recordSpend(source)
↓
ingest(runId, source, raw) → writes job_listings, enqueues match()
↓
markRunSuccess(runId, stats)
```

Every adapter call is wrapped in this pattern. No adapter can hang the scheduler; no adapter sees state outside its own params.

### 5.4 Error contracts

```ts
class SourceTransientError extends Error {}     // retry next tick
class SourcePermanentError extends Error {}     // mark run failed
class SourceBudgetError     extends Error {}    // mark run skipped_budget
```

Unknown errors get wrapped in `SourcePermanentError` with `{ cause }`. The scheduler decides retry vs fail based on type.

### 5.5 Per-adapter notes

**`adzuna.ts`** (~120 LoC). REST API. Free 250 calls/day quota, tracked in `source_quotas_daily`. Country defaults via `ADZUNA_DEFAULT_COUNTRY` env, profile's `countryHint` overrides.

**`indeed-mcp.ts`** (~200 LoC). MCP client (stdio or HTTP transport). Pool one MCP server instance per Node process. `available()` does a `listTools` ping with 5s timeout.

**`dice-mcp.ts`** (~150 LoC). Same pattern as Indeed-MCP. US tech only. Returns `[]` cleanly when query is non-tech.

**`jobspy.ts`** (~180 LoC). Imports `ts-jobspy` directly — no subprocess. Configurable boards via `JOBSPY_BOARDS` env. LinkedIn throttled by token-bucket (6 calls/min default). Rate-limit errors mark run `partial`, persist what was retrieved.

**`apify.ts`** (~250 LoC, most complex). Apify HTTP API. Three actors (LinkedIn jobs, Glassdoor, LinkedIn Company). Hard budget gate via `BUDGET_APIFY_USD_MONTHLY` (default $5). Long-running actors (30-90s) polled every 3s with exponential backoff, AbortSignal honored.

### 5.6 Backward compatibility

Existing v2.4 routes `/api/jobs/search` and `/api/jobs/search/linkedin` get refactored to delegate to `jsearch.ts` and `linkedin-jsearch.ts` adapters. The two recent location-fix commits (3b4f301, 4d7d3f9) stay green — verified by smoke tests during refactor.

## 6. Scheduler

### 6.1 Boot

`src/instrumentation.ts` is Next.js's official one-time process init hook. It imports `bootScheduler()` from `src/lib/scheduler/boot.ts`. The scheduler only starts when `ENABLE_SCHEDULER=1` OR `NODE_ENV=production`.

```ts
// src/instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { bootScheduler } = await import('./lib/scheduler/boot');
    bootScheduler();
  }
}
```

```ts
// src/lib/scheduler/boot.ts
import cron from 'node-cron';
import { tick } from './tick';
import { reapOrphanedRuns } from './reap';

let booted = false;

export function bootScheduler() {
  if (booted) return;
  if (process.env.ENABLE_SCHEDULER !== '1' && process.env.NODE_ENV !== 'production') return;
  booted = true;
  reapOrphanedRuns();                       // safety net for crashes
  cron.schedule('* * * * *', tick, { name: 'rolehunter-tick' });
  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);
}
```

### 6.2 Tick algorithm

```ts
const TICK_LOCK_KEY = 0x434F_4853;            // 'COHS' — Postgres advisory lock key
const BATCH_SIZE = parseInt(process.env.SCHEDULER_BATCH_SIZE ?? '10', 10);

export async function tick() {
  const due = await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${TICK_LOCK_KEY})`);

    const rows = await tx.select().from(searchProfiles)
      .where(and(eq(searchProfiles.active, true), lte(searchProfiles.nextRunAt, sql`NOW()`)))
      .orderBy(searchProfiles.nextRunAt)
      .limit(BATCH_SIZE);

    if (rows.length === 0) return [];

    // Claim before work: advance next_run_at so a crash doesn't trap profiles
    await tx.update(searchProfiles)
      .set({
        lastRunAt: sql`NOW()`,
        nextRunAt: sql`NOW() + frequency_to_interval(frequency)`,
      })
      .where(inArray(searchProfiles.id, rows.map(r => r.id)));

    return rows;
  });

  // Outside transaction: fire async, no await
  for (const profile of due) {
    runProfile(profile).catch(err => console.error('[scheduler] runProfile crash', err));
  }
}
```

Three properties:
1. **Advisory lock** serializes dev-mode double-fires
2. **Claim before work**: `next_run_at` advanced inside transaction; crash mid-fetch doesn't trap a profile
3. **Async fan-out**: tick returns in ~10ms; actual fetches happen on the event loop

### 6.3 Per-profile execution

```ts
async function runProfile(profile: SearchProfile) {
  await Promise.allSettled(
    profile.sources.map(source => runProfileSource(profile, source))
  );
}

async function runProfileSource(profile: SearchProfile, source: JobSourceId) {
  const [{ id: runId }] = await db.insert(searchRuns).values({
    profileId: profile.id, source, status: 'running',
  }).returning({ id: searchRuns.id });

  const adapter = registry.get(source);
  const av = await adapter.available();
  if (!av.ok) return markRunSkipped(runId, av.reason);

  if (!await budget.canSpend(source, adapter.costEstimate(profile.toSearchParams()))) {
    return markRunSkipped(runId, 'budget_cap_reached');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('adapter_timeout_120s')), 120_000);
  const t0 = performance.now();

  try {
    const raw = await adapter.search(profile.toSearchParams(), controller.signal);
    const ingestResult = await ingest(runId, source, profile.id, raw);
    await budget.recordSpend(source, adapter.costEstimate(profile.toSearchParams()));
    await markRunSuccess(runId, {
      durationMs: Math.round(performance.now() - t0),
      jobsFound: raw.length,
      jobsNew: ingestResult.new,
      jobsDuplicate: ingestResult.duplicate,
    });
  } catch (err) {
    await markRunFailed(runId, err, Math.round(performance.now() - t0));
  } finally {
    clearTimeout(timer);
  }
}
```

### 6.4 Knobs

| Env | Default | Purpose |
|---|---|---|
| `ENABLE_SCHEDULER` | unset in dev, on in prod | Opt-in for dev |
| `SCHEDULER_BATCH_SIZE` | 10 | Max profiles per tick |
| `MATCH_QUEUE_CONCURRENCY` | 4 | Parallel match() calls in score queue |
| `AUTO_SCORE_PROVIDER` | `ollama` if reachable else `claude` | Provider for auto-score (see §12) |
| `AUTO_SCORE_MODEL` | provider-specific (see §12 table) | Model name within provider |

### 6.5 Graceful shutdown & boot reaper

On SIGTERM, stop the cron, wait up to 30s for in-flight runs, warn if any incomplete. On next boot, any `search_runs` with status `running` older than 5 minutes get reaped to `failed: 'orphaned_at_shutdown'`.

### 6.6 Manual trigger

`POST /api/search-profiles/:id/run-now` sets `next_run_at = NOW()`. The next 60s tick picks it up. (Synchronous execution rejected: a slow Apify call would hold the HTTP request open for 2 minutes.)

## 7. Ingest pipeline

### 7.1 Steps

1. Normalize RawJob → job_listings row (pure)
2. Compute `dedupe_hash = md5(normalized title|company|city|posted_day)`
3. SELECT existing row by hash
4. If exists: append to `sources_seen`, update `fetched_at`. Status: `duplicate`.
5. If new: INSERT new row with `sources_seen = [first sighting]`. Status: `new`. Enqueue match().
6. match() (async, queued): writes to `matches` table, updates `job_listings.top_score = GREATEST(COALESCE(top_score, 0), new_score)`.

### 7.2 Normalize

Pure function. No DB, no network. Handles:

- **Salary**: hourly → annual × 2080; period normalization; store as-is in salary_currency
- **Location**: parse "London, UK" → `{ city, country }` via lookup table; fall back to `{ raw }`
- **Remote mode**: regex over title + description; source-provided wins
- **Description**: HTML → markdown via `turndown`
- **Posted date**: parse RFC 3339 / ISO 8601 / "5 days ago" / Unix epoch

### 7.3 Dedupe hash

```ts
function dedupeHash(j: RawJob): string {
  const norm = (s?: string) => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  const date = j.postedAt ? new Date(j.postedAt).toISOString().slice(0, 10) : 'unknown';
  const city = norm(j.location?.city ?? j.location?.raw ?? '');
  const key  = `${norm(j.title)}|${norm(j.company)}|${city}|${date}`;
  return crypto.createHash('md5').update(key).digest('hex');
}
```

Why title + company + city + posted-day: core identity, geographic distinction, repost-as-new semantics (recruiters often repost to push to top of feed — treating reposts as new is correct).

### 7.4 Upsert vs merge

```ts
async function ingestOne(source, profileId, raw): Promise<'new'|'duplicate'> {
  const hash = dedupeHash(raw);
  const sighting = { source, externalId: raw.externalId, url: raw.url, fetchedAt: new Date().toISOString() };

  const existing = await db.select({ id, sourcesSeen }).from(jobListings)
    .where(eq(jobListings.dedupeHash, hash)).limit(1);

  if (existing.length > 0) {
    const already = existing[0].sourcesSeen.some(s => s.source === source && s.externalId === raw.externalId);
    if (!already) {
      await db.update(jobListings)
        .set({ sourcesSeen: sql`sources_seen || ${JSON.stringify([sighting])}::jsonb`, fetchedAt: sql`NOW()` })
        .where(eq(jobListings.id, existing[0].id));
    }
    return 'duplicate';
  }

  const normalized = normalizeForInsert(raw, source);
  const [inserted] = await db.insert(jobListings).values({
    ...normalized,
    dedupeHash: hash,
    sourcesSeen: [sighting],
    searchProfileId: profileId,
    fetchedAt: new Date(),
  }).returning({ id: jobListings.id });

  enqueueScore(inserted.id);
  return 'new';
}
```

Sequential within one ingest call. No transaction needed; the existing-check + insert is serialized.

### 7.5 Score queue

In-memory async queue. Concurrency capped by `MATCH_QUEUE_CONCURRENCY=4`. On restart, the queue is lost — jobs without a score appear in `/jobs` under the "Unscored" filter and can be manually scored via the existing `/jobs/[id]` match button.

```ts
const queue: ScoreTask[] = [];
let inFlight = 0;

export function enqueueScore(jobId: string) {
  queue.push({ jobId });
  drain();
}

function drain() {
  while (inFlight < MAX && queue.length > 0) {
    const task = queue.shift()!;
    inFlight++;
    runScore(task).finally(() => { inFlight--; drain(); });
  }
}

async function runScore({ jobId }: ScoreTask) {
  const cv = await getActiveCv();
  if (!cv) return;
  const job = await getJob(jobId);
  if (!job) return;

  const provider = await getProvider('auto_score');     // task-key lookup per §12
  try {
    const result = await provider.match(cv.parsed, job);
    await db.insert(matches).values({
      jobId, cvMasterId: cv.id, provider: provider.name,
      score: result.score, strengths: result.strengths, gaps: result.gaps,
      reasoning: result.reasoning,
    });
    await db.update(jobListings)
      .set({ topScore: sql`GREATEST(COALESCE(top_score, 0), ${result.score})` })
      .where(eq(jobListings.id, jobId));
    await spendCounter.add('auto_score', estimatedCostFor(provider.name));
  } catch (err) {
    console.warn('[score] failed', { jobId, err });
  }
}
```

### 7.6 Edge cases

| Case | Behavior |
|---|---|
| Missing `externalId` | Synthesize from `md5(url + title)` |
| Missing `url` | Skip — log warning |
| Missing `postedAt` | dedupe date = 'unknown' |
| Description <10 chars | Skip |
| match() times out | Score never written; job appears 'Unscored' |
| Active CV deleted mid-run | `getActiveCv()` returns null; skip silently |
| LLM returns score > 100 or < 0 | Clamp to [0, 100] before insert |

### 7.7 Decision: `top_score` is monotonic max

`top_score = GREATEST(COALESCE(top_score, 0), new_score)`. Swapping CVs preserves the best historical score. Honest about "this job is a 78-match for some version of you." Alternative considered (latest-CV-only with reranker on swap) deferred to v3.1 alongside pgvector.

## 8. UI

### 8.1 New page: `/search`

Profile CRUD + run history. Single tall form modal for create/edit. Profile cards with inline actions (Run now, Pause, Edit, History, Delete). Run-history drawer shows last 20 runs with per-source status, jobs counts, duration, cost.

Profile form fields:
- Name (text, required)
- Query (text, required, with advanced operators toggle)
- Location (autocomplete, reused from linkedin/locations.ts)
- Location radius km (number, optional)
- Salary min / max / currency
- Remote modes (chip multi-select)
- Experience levels (chips)
- Job types (chips)
- Sources (chip multi-select, grayed-out with reason if `available()` returns `!ok`)
- Frequency (radio: hourly / every 4h / daily / weekly)
- Max results per run (default 50)

Validation: name + query + ≥1 source + ≥1 remote mode required.

### 8.2 Rebuilt `/jobs`

Default sort `top_score DESC, fetched_at DESC`. Score-band filter chips (Top ≥70, Stretch 50-69, Pass <50, Unscored). Source filter. Profile filter. Recency filter.

Per-row badges:
- Score pill (colored: 🔥 ≥70 red, 💪 50-69 amber, 😴 <50 gray, ❓ NULL gray)
- `NEW` ribbon if `fetched_at < 24h`
- Source chip list (`sources_seen`, ordered by `fetched_at DESC`)
- "From: <profile name>" if `search_profile_id` set, clickable
- Gap snippet (first 1-2 from matches.gaps) — Stretch band only

Preserved: existing paste form, existing JSearch/LinkedIn one-shot search forms (UI identical, adapter-backed now).

### 8.3 New / changed API routes

```
GET    /api/search-profiles              # list
POST   /api/search-profiles              # create
GET    /api/search-profiles/:id          # get one
PATCH  /api/search-profiles/:id          # update
DELETE /api/search-profiles/:id          # delete (cascades to search_runs)
POST   /api/search-profiles/:id/run-now  # advance next_run_at to NOW
GET    /api/search-profiles/:id/runs     # last N runs
GET    /api/admin/runs                   # last 100 across all profiles, filterable
GET    /api/admin/budgets                # current month state per source
```

Existing routes unchanged in path; refactored to adapter-backed internally.

### 8.4 Accessibility

- Score pills: `aria-label="Match score 87 out of 100"`
- Filter chips: toggle buttons with `aria-pressed`
- Drawers: Radix Dialog focus trap
- Color is never the only signal — every score band has color + emoji + numeric

## 9. Cost controls & observability

### 9.1 Env knobs

```sh
BUDGET_APIFY_USD_MONTHLY=5
BUDGET_AUTO_SCORE_USD_MONTHLY=10
BUDGET_ADZUNA_DAILY_CALLS=240
AUTO_SCORE_PROVIDER=ollama                # falls back to claude if Ollama unreachable; see §12
DEFAULT_LLM_PROVIDER=claude
ENABLE_SCHEDULER=1
SCHEDULER_BATCH_SIZE=10
MATCH_QUEUE_CONCURRENCY=4
PRICING_OVERRIDES_JSON=                # optional, JSON object merged into PRICING
```

### 9.2 Pricing table

```ts
export const PRICING: Record<string, { perCall: number; unit: string }> = {
  paste:      { perCall: 0,      unit: 'free'                 },
  jsearch:    { perCall: 0,      unit: 'rapidapi-included'    },
  linkedin:   { perCall: 0,      unit: 'rapidapi-included'    },
  adzuna:     { perCall: 0,      unit: 'free-quota'           },
  indeed:     { perCall: 0,      unit: 'partner-free'         },
  dice:       { perCall: 0,      unit: 'free'                 },
  jobspy:     { perCall: 0,      unit: 'free-library'         },
  apify:      { perCall: 0.05,   unit: 'usd-per-actor-run'    },
  auto_score: { perCall: 0.0008, unit: 'usd-claude-haiku'     },
};
```

Overridable via `PRICING_OVERRIDES_JSON` env var.

### 9.3 Budget gate

```ts
export const budget = {
  async canSpend(source: string, projectedUsd: number): Promise<boolean> {
    const cap = budgetCapFor(source);
    if (cap === 0 || cap === Infinity) return true;
    const row = await getOrCreateBudgetRow(source, currentMonthYear(), cap);
    return Number(row.estimatedSpendUsd) + projectedUsd <= cap;
  },
  async recordSpend(source: string, usd: number) {
    await db.update(sourceBudgets)
      .set({
        usageCount: sql`usage_count + 1`,
        estimatedSpendUsd: sql`estimated_spend_usd + ${usd}`,
        updatedAt: sql`NOW()`,
      })
      .where(and(eq(sourceBudgets.source, source), eq(sourceBudgets.monthYear, currentMonthYear())));
  },
};
```

### 9.4 Fail-open behavior

When a source hits its cap, that source's `search_runs` row gets status `skipped_budget`. The profile's other sources still run. The user sees this in run history; the /search page shows a banner when a recent run skipped due to budget. No silent skipping.

### 9.5 Observability surfaces

- `/api/admin/runs` — last 100 search_runs as JSON
- `/api/admin/budgets` — current month per-source state
- Structured logs with `runId` correlation
- 90-day search_runs retention; manual prune in /search page

### 9.6 Cost projection

| Source | Calls/day | Cost/call | Daily | Monthly |
|---|---|---|---|---|
| Adzuna | 50 | $0 | $0 | $0 |
| Indeed | 50 | $0 | $0 | $0 |
| Dice | 30 | $0 | $0 | $0 |
| ts-jobspy | 50 | $0 | $0 | $0 |
| Apify | 5 | ~$0.05–0.30 | $0.25–1.50 | capped $5 |
| auto_score | ~200 jobs | $0.0008 | $0.16 | ~$5 |
| **Total** | | | | **~$10/mo max** |

Drops to ~$1/mo if `AUTO_SCORE_PROVIDER=gemini` with `GEMINI_MODEL=gemini-1.5-flash`. Drops to **$0/mo for LLM** if `AUTO_SCORE_PROVIDER=ollama` (Apify floor is the only remaining cost — see §12).

## 10. Migration path from v2.4

### 10.1 Migration files

```
src/lib/db/migrations/
  ├── 0006_v3_enum_extension.sql         # NEW — pre-step, outside transaction
  ├── 0007_v3_new_tables.sql             # NEW
  ├── 0008_v3_job_listings_columns.sql   # NEW
  ├── 0009_v3_indexes_and_fns.sql        # NEW
  └── 0010_v3_backfill.sql               # NEW
```

### 10.2 0006 — enum extension

Postgres rejects `ADD VALUE` inside a transaction. Isolated in its own file:

```sql
ALTER TYPE job_source ADD VALUE IF NOT EXISTS 'adzuna';
ALTER TYPE job_source ADD VALUE IF NOT EXISTS 'indeed';
ALTER TYPE job_source ADD VALUE IF NOT EXISTS 'dice';
ALTER TYPE job_source ADD VALUE IF NOT EXISTS 'jobspy';
ALTER TYPE job_source ADD VALUE IF NOT EXISTS 'apify';

CREATE TYPE profile_frequency AS ENUM ('hourly', 'every_4h', 'daily', 'weekly');
CREATE TYPE search_run_status AS ENUM ('running', 'success', 'failed', 'partial', 'skipped_budget');
```

### 10.3 0007 — new tables

Straight CREATE TABLE for `search_profiles`, `search_runs`, `source_budgets`, `source_quotas_daily`. Transaction-safe.

### 10.4 0008 — `job_listings` column additions

```sql
ALTER TABLE job_listings
  ADD COLUMN dedupe_hash       text,
  ADD COLUMN sources_seen      jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN fetched_at        timestamp NOT NULL DEFAULT NOW(),
  ADD COLUMN top_score         smallint,
  ADD COLUMN search_profile_id integer REFERENCES search_profiles(id) ON DELETE SET NULL;
```

### 10.5 0009 — indexes and helper function

```sql
CREATE INDEX idx_jobs_feed        ON job_listings (top_score DESC NULLS LAST, fetched_at DESC);
CREATE INDEX idx_jobs_dedupe      ON job_listings (dedupe_hash);
CREATE INDEX idx_jobs_fetched     ON job_listings (fetched_at DESC);
CREATE INDEX idx_jobs_profile     ON job_listings (search_profile_id);
CREATE INDEX idx_profiles_due     ON search_profiles (active, next_run_at);
CREATE INDEX idx_runs_profile     ON search_runs (profile_id, started_at DESC);
CREATE INDEX idx_runs_status      ON search_runs (status);

CREATE OR REPLACE FUNCTION frequency_to_interval(f profile_frequency)
RETURNS interval AS $$
  SELECT CASE f
    WHEN 'hourly'   THEN interval '1 hour'
    WHEN 'every_4h' THEN interval '4 hours'
    WHEN 'daily'    THEN interval '1 day'
    WHEN 'weekly'   THEN interval '7 days'
  END
$$ LANGUAGE sql IMMUTABLE;
```

### 10.6 0010 — backfill

```sql
-- dedupe_hash for existing rows
UPDATE job_listings SET dedupe_hash = md5(
  lower(coalesce(title, ''))    || '|' ||
  lower(coalesce(company, ''))  || '|' ||
  lower(coalesce(location, '')) || '|' ||
  coalesce(to_char(posted_at::date, 'YYYY-MM-DD'), 'unknown')
)
WHERE dedupe_hash IS NULL;

-- sources_seen for existing rows
UPDATE job_listings SET sources_seen = jsonb_build_array(
  jsonb_build_object(
    'source',     source::text,
    'externalId', coalesce(external_id, id::text),
    'url',        coalesce(url, ''),
    'fetchedAt',  to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SSZ')
  )
)
WHERE sources_seen = '[]'::jsonb;

-- top_score from existing matches
UPDATE job_listings j SET top_score = sub.max_score
FROM (SELECT job_id, MAX(score) AS max_score FROM matches GROUP BY job_id) sub
WHERE j.id = sub.job_id AND j.top_score IS NULL;
```

Idempotent — running twice is safe.

### 10.7 `package.json` delta

```diff
  "dependencies": {
+   "node-cron": "^4.2.0",
+   "ts-jobspy": "^2.0.0",
+   "@modelcontextprotocol/sdk": "^1.0.0",
+   "openai": "^4.70.0 <5.0.0",         // stay on v4; v5/v6 changed client surface (chat.completions → responses)
+   "ollama": "^0.5.16",
+   "turndown": "^7.2.0",
    // existing...
  }
```

### 10.8 `Dockerfile` delta

**Likely none, but verify with a clean `next build` first.** Next.js's dependency tracer follows `instrumentation.ts`'s import graph when `output: 'standalone'` is set (it is, per v2.4). The runner stage from the v2.4 hotfix already covers `drizzle-orm` and `scripts/migrate.mjs`.

**Caveat — MCP stdio transport.** The `@modelcontextprotocol/sdk` stdio client spawns Python (Indeed-MCP, Dice-MCP) or Node (Dice-MCP via JS) subprocesses. Next.js's standalone tracer does not chase runtime-spawned binaries. If the MCP servers ship as bundled binaries we vendor into the image, we need a `COPY` step. If they're installed via `pip`/`npm` at build time, we need a `RUN` step. The first implementation PR for Indeed-MCP and Dice-MCP must reconcile this — see issue [#32](https://github.com/olafkfreund/rolehunter/issues/32) and [#33](https://github.com/olafkfreund/rolehunter/issues/33). Adzuna, ts-jobspy, Apify, Ollama (over HTTP), OpenAI all run in-process — no Dockerfile delta for those.

### 10.9 Env additions

Document all new env vars in `.env.example` with safe defaults. App boots with no required new env (all defaults work).

### 10.10 Rollout sequence

1. Merge v3.0 PR to main
2. `git pull` on deployment host
3. `docker compose build app`
4. `docker compose up -d app`
5. `docker compose exec app node scripts/migrate.mjs` (applies 0006-0010)
6. Verify health: `curl /api/health`
7. Verify scheduler: `docker compose logs app | grep '[scheduler]'`
8. Create one search profile in `/search` to smoke-test
9. Wait one tick, check `/jobs`

### 10.11 Rollback

Additive migrations — only new objects need dropping. The user's v2.4 data is untouched. See [section 8 of the brainstorm](#) for the explicit drop-script. Enum values added cannot be removed in Postgres but are harmless.

### 10.12 Pre-flight on throwaway DB

Same pattern as v2.4 hotfix:

```sh
docker compose exec db psql -U rolehunter -c 'CREATE DATABASE rolehunter_v3_test TEMPLATE rolehunter;'
DATABASE_URL=postgres://rolehunter:$PW@db:5432/rolehunter_v3_test \
  docker compose exec app node scripts/migrate.mjs
docker compose exec db psql -U rolehunter -d rolehunter_v3_test -c '\dt' | grep -E 'search_|source_'
docker compose exec db psql -U rolehunter -c 'DROP DATABASE rolehunter_v3_test;'
```

## 11. v3 macro-roadmap

| Phase | Theme | Key additions | Epic |
|---|---|---|---|
| **v3.0** *(this spec)* | The firehose, ranked | `search_profiles`, `search_runs`, `source_budgets`, 5 new adapters, scheduler | [#28](https://github.com/olafkfreund/rolehunter/issues/28) |
| v3.1 | Match-me deepened (Portfolio Knowledge Graph) | `portfolio_sources`, `portfolio_items`, `portfolio_embeddings`, `application_projects`, `cv_embeddings`, `job_embeddings`. GitHub/GitLab repo ingestion, blog/website crawl, Obsidian vault sync, manual entries. Per-job top-K projects featured in CV tailoring. | [#42](https://github.com/olafkfreund/rolehunter/issues/42) |
| v3.2 | Company intel & enrichment (expanded) | `companies`, `company_offices` (geocoded), `company_reviews`, `company_benefits`, `company_news`, `company_layoffs`, `company_connections` tables. Glassdoor + Blind + Levels.fyi + NewsAPI + layoffs.fyi + Crunchbase + Google Maps commute + LinkedIn Company scraper. "Should you work here?" panel: ⭐ rating / 💰 salary / 🏢 days-in-office / 🚊 commute / ⚠️ layoffs / 🤝 connections / 🎁 benefits / 💼 pension. Per-user weights drive a fit score complementing CV-match score. | [#43](https://github.com/olafkfreund/rolehunter/issues/43) |
| v3.3 | ATS-aware tailoring | GREEN-tier techniques, sanitizer, form-field gen, pre-flight ATS score | [#44](https://github.com/olafkfreund/rolehunter/issues/44) |
| v3.4 | Interview deepened + transcripts + testing platforms | mock interviews, spaced-repetition gap drills, per-company behavioral bank, Whisper transcripts, testing-platform email-tracking (coaching only — never solving) | [#45](https://github.com/olafkfreund/rolehunter/issues/45) |
| v3.5 | Recruiter Communication & Automation Hub | email IMAP/SMTP via OAuth, Telegram bot, WhatsApp **receive-only**, recruiter funnel model (10-stage canonical), draft-always-with-human-review, voice-matched outbound, calendar integration, offer/negotiation tracking | [#46](https://github.com/olafkfreund/rolehunter/issues/46) |

## 12. LLM Provider Expansion

v2.4 supports Claude + Gemini via `src/lib/llm/index.ts`'s `getProvider()`. v3.0 extends to a 4-way provider matrix with per-task selection. The headline change: **Ollama becomes the default for high-volume tasks like auto-score, dropping its monthly cost from ~$5 to $0.**

### Providers

| Provider | Status | Models supported | Cost | Notes |
|---|---|---|---|---|
| `claude` | existing v2.4 | claude-3.5-sonnet, claude-haiku-4.5, opus-4.X | Anthropic API | Already in `src/lib/llm/claude.ts`; ephemeral prompt caching preserved |
| `gemini` | existing v2.4 | gemini-1.5-flash, gemini-1.5-pro, gemini-2.5-* | Google API | Already in `src/lib/llm/gemini.ts` |
| `openai` | **NEW** | gpt-4o, gpt-4o-mini, gpt-4.1, gpt-4.1-mini | OpenAI API | Uses `openai` SDK; covers "Codex" use case via gpt-4o-mini |
| `ollama` | **NEW** | llama3.1:8b, llama3.1:70b, mistral, qwen2.5:7b, deepseek-r1, etc. | **Free** (local compute) | Uses `ollama` JS client → `http://localhost:11434`; auto-detect at boot |

**GitHub Copilot is deliberately not included.** Copilot doesn't expose a public chat-completion API outside IDE integrations. If GitHub Models API matures or "Copilot Workspace API" ships, add a `github_models` provider then.

### Provider interface (extended)

The v2.4 `LlmProvider` interface in `src/lib/llm/types.ts` stays the same shape, with one change: `available()` becomes async to accommodate Ollama's network probe.

```ts
// src/lib/llm/openai.ts
export const openaiProvider: LlmProvider = {
  name: 'openai',
  available: async () => Boolean(process.env.OPENAI_API_KEY),
  match: (cv, job) => callOpenAi(SYSTEM_MATCH, formatMatchUser(cv, job), modelFor('openai', 'match')),
  rewriteCv: ...,
  // ...same methods as claude/gemini
};

// src/lib/llm/ollama.ts
export const ollamaProvider: LlmProvider = {
  name: 'ollama',
  available: async () => {
    try {
      const r = await fetch(`${process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434'}/api/tags`, {
        signal: AbortSignal.timeout(2000),
      });
      return r.ok;
    } catch { return false; }
  },
  match: (cv, job) => callOllama(SYSTEM_MATCH, formatMatchUser(cv, job), modelFor('ollama', 'match')),
  // ...
};
```

### Per-task provider selection

Each high-frequency or expensive task gets its own env so users can tune cost/quality independently.

| Task | Env var | Default | Notes |
|---|---|---|---|
| Auto-score (scheduler) | `AUTO_SCORE_PROVIDER` | `ollama` if reachable else `claude` | Highest volume — Ollama saves money |
| Per-click match | `MATCH_PROVIDER` | `DEFAULT_LLM_PROVIDER` | User-initiated; quality > cost |
| CV rewrite | `CV_REWRITE_PROVIDER` | `DEFAULT_LLM_PROVIDER` | High-stakes |
| Cover letter | `COVER_LETTER_PROVIDER` | `DEFAULT_LLM_PROVIDER` | High-stakes |
| Flashcards | `FLASHCARDS_PROVIDER` | `DEFAULT_LLM_PROVIDER` | Can use cheaper |
| Gap canonicalization | `GAPS_PROVIDER` | `DEFAULT_LLM_PROVIDER` | Batch; long context (8k tokens) — prefer Claude/Gemini |
| LinkedIn import | `LINKEDIN_IMPORT_PROVIDER` | `DEFAULT_LLM_PROVIDER` | Long output (16k) — needs Claude/Gemini |
| LinkedIn SEO | `LINKEDIN_SEO_PROVIDER` | `DEFAULT_LLM_PROVIDER` | Mid-stakes |
| Learning resources | `LEARN_RESOURCES_PROVIDER` | `DEFAULT_LLM_PROVIDER` | Curation; quality matters |
| Fallback | `DEFAULT_LLM_PROVIDER` | `claude` | Used when task-specific not set |

Per-provider model env vars:

- `CLAUDE_MODEL` (existing)
- `GEMINI_MODEL` (existing)
- `OPENAI_MODEL` (new, default `gpt-4o-mini`)
- `OLLAMA_MODEL` (new, default `llama3.1:8b`)
- `OLLAMA_BASE_URL` (new, default `http://localhost:11434`)
- `OPENAI_API_KEY` (new)

### Fallback chain

`getProvider(taskKey?)` returns the first available provider in this order:
1. The task-specific override (e.g., `AUTO_SCORE_PROVIDER`)
2. `DEFAULT_LLM_PROVIDER`
3. Claude if `ANTHROPIC_API_KEY` set
4. Gemini if `GOOGLE_API_KEY` set
5. OpenAI if `OPENAI_API_KEY` set
6. Ollama if `/api/tags` returns 200

If none available, operation logs and skips (auto-score returns NULL score; user-facing operations show clear error).

### Quality vs cost for auto-score (the highest-volume task)

| Provider | Model | Cost/match | Quality (subjective) |
|---|---|---|---|
| Claude | claude-haiku-4.5 | $0.0008 | High |
| Claude | claude-sonnet-4 | $0.012 | Highest |
| Gemini | gemini-1.5-flash | $0.0001 | High |
| Gemini | gemini-1.5-pro | $0.006 | Very high |
| OpenAI | gpt-4o-mini | $0.0003 | High |
| OpenAI | gpt-4o | $0.008 | Very high |
| **Ollama** | **llama3.1:8b** | **$0** | **Medium-high** (sufficient for structured 0-100 numeric scoring) |
| Ollama | llama3.1:70b | $0 (heavy GPU) | High |
| Ollama | qwen2.5:7b | $0 | Medium-high |
| Ollama | deepseek-r1:8b | $0 | Medium-high (chain-of-thought aids scoring) |

**Recommendation:** default `AUTO_SCORE_PROVIDER=ollama` with `OLLAMA_MODEL=llama3.1:8b`. Falls back to `claude-haiku` if Ollama unreachable.

### Cost impact (revised projection)

| Item | Original v3.0 plan | With Ollama for auto-score |
|---|---|---|
| Apify on-demand | $5/mo | $5/mo |
| auto_score (LLM) | ~$5/mo (Claude Haiku) | **$0** |
| **Total** | ~$10/mo | **~$5/mo** |

If `MATCH_PROVIDER`, `CV_REWRITE_PROVIDER`, etc. also point to Ollama: total drops to **~$5/mo** (Apify is the only remaining cost).

### UI: `/settings/llm` (new, small page)

- Per-provider availability indicator (✓ Claude / ✓ Gemini / × OpenAI / ✓ Ollama @ localhost:11434)
- Current per-task assignments with dropdowns
- One-click "test" button per provider that fires a 50-token health-check call
- Cost projection summary based on current assignments + scheduler tick frequency

### Quality-calibration safety net

First implementation includes a small eval suite under `src/lib/llm/__tests__/eval.ts`: 20 (CV, JD) reference pairs, run through each configured provider, surface score drift > 15 points between providers as a warning. Catches "Ollama scores everyone 95" pathologies before they pollute the ranked feed.

### Subtle decisions

1. **Ollama auto-detection at boot.** `bootScheduler()` runs a 2-second `/api/tags` probe. If reachable, default `AUTO_SCORE_PROVIDER` resolves to ollama. If not, falls through. Logs the detected state.
2. **No new container for Ollama.** Self-hosted user runs Ollama on the host or as a separate compose service — we just point at the URL.
3. **`available()` becomes async.** Minor breaking change to the v2.4 `LlmProvider` interface; existing claude/gemini providers updated to async returning resolved booleans.
4. **OpenAI included even though not in user's literal list.** "Codex" is a deprecated model line; modern code-capable OpenAI is gpt-4o family. `openai` provider covers it.
5. **Schema unchanged.** All LLM work in `src/lib/llm/`. No new tables; `matches.provider text` accepts any string.

### ATS posture (deferred to v3.3)

The original brainstorm included a GREEN/YELLOW/RED taxonomy for ATS techniques. Per reviewer feedback, the full taxonomy now lives in epic [#44 v3.3](https://github.com/olafkfreund/rolehunter/issues/44). v3.0 just inherits the existing v2.4 CV-rewrite prompt unchanged. The output sanitizer (strip zero-width chars, white-text patterns) is a v3.3 addition; v3.0 doesn't need it yet because v3.0 doesn't add new generation paths.

## 13. Tracking

All 13 v3.0 child issues link to epic [#28](https://github.com/olafkfreund/rolehunter/issues/28):

- Schema: [#29](https://github.com/olafkfreund/rolehunter/issues/29) · Migration: [#41](https://github.com/olafkfreund/rolehunter/issues/41)
- Adapter framework: [#30](https://github.com/olafkfreund/rolehunter/issues/30)
- Adapters: Adzuna [#31](https://github.com/olafkfreund/rolehunter/issues/31) · Indeed-MCP [#32](https://github.com/olafkfreund/rolehunter/issues/32) · Dice-MCP [#33](https://github.com/olafkfreund/rolehunter/issues/33) · ts-jobspy [#34](https://github.com/olafkfreund/rolehunter/issues/34) · Apify [#35](https://github.com/olafkfreund/rolehunter/issues/35)
- Scheduler: [#36](https://github.com/olafkfreund/rolehunter/issues/36)
- Ingest: [#37](https://github.com/olafkfreund/rolehunter/issues/37)
- UI: /search [#38](https://github.com/olafkfreund/rolehunter/issues/38) · /jobs ranked feed [#39](https://github.com/olafkfreund/rolehunter/issues/39)
- Cost controls: [#40](https://github.com/olafkfreund/rolehunter/issues/40)

## 14. Decisions log

| # | Decision | Alternative considered | Reason |
|---|---|---|---|
| D-01 | v3.0 anchor = multi-source aggregation + saved searches | CV-driven match-me first | Without breadth of fresh data, downstream sub-systems have nothing rich to chew on |
| D-02 | Source bundle = Free + light paid ($5/mo Apify cap) | Free-only / aggregator-first ($20-50/mo) / maximum | Best coverage/cost ratio; Apify covers LinkedIn rate-limit gaps + unlocks v3.2 enrichment |
| D-03 | Auto-score at ingest using existing match() | Fetch only (score per-click) / embedding-based | Reuses existing LLM stack; ~$3-5/mo Haiku; ranked feed becomes immediately useful |
| D-04 | Scheduler = node-cron in-process | Sidecar worker container / host cron | Single-user, single-instance; no env-var duplication or extra crash domain |
| D-05 | Dedupe = merge into single row | Keep separate rows linked by hash | UI clarity; `sources_seen.length > 1` becomes quality signal |
| D-06 | `top_score` is monotonic-max | Latest-active-CV / per-CV columns | Honest history preservation; v3.1 reranker can change semantics if needed |
| D-07 | `auto_score` is a synthetic budget source | Mix into `job_source` enum | Cleanly separated; never a job-source value |
| D-08 | RED ATS techniques out of scope, sanitizer mandatory | Configurable RED tier | Career-risk; sanitizer protects user from accidental contamination |
| D-09 | Postgres advisory locks for dev double-fires | SETTINGS-based singleton / pidfile | Native, free, cleaner |
| D-10 | No Dockerfile changes needed | Add new RUN steps for new deps | Next.js dependency tracer handles it via `instrumentation.ts` |
| D-11 | v3.1 scope expanded to Personal Knowledge Graph (GitHub/GitLab/blog/Obsidian/manual ingestion → matching → CV tailoring) per user input 2026-05-31; v3.0 unchanged | Pull portfolio module into v3.0 / defer to a new v3.6 | Portfolio and aggregation are orthogonal; bundling delays both by months. v3.0 ships, v3.1 builds on its rich job corpus. See epic [#42](https://github.com/olafkfreund/rolehunter/issues/42) for expanded scope |
| D-12 | v3.0 includes LLM provider expansion: OpenAI + Ollama added to existing Claude + Gemini, per-task provider selection env vars, Ollama default for auto-score | Defer to v3.1; keep Claude-only auto-score | User explicitly asked; Ollama drops auto-score cost to $0; scope is contained to `src/lib/llm/` with no schema impact. See issue [#47](https://github.com/olafkfreund/rolehunter/issues/47) |
| D-13 | New v3.0 tables use `serial` integer PKs, matching v2.4 convention | `uuid` PKs (original draft) | Reviewer caught FK type mismatch — `job_listings.id` is `serial` in v2.4; FK from it must match. Consistency with v2.4 wins over uuid's distributed-system benefits we don't need at single-user scale |
| D-14 | GitHub Copilot deferred — not in v3.0 LLM providers | Include via reverse-engineered API | Copilot has no public chat-completion API outside IDE. Revisit when GitHub Models API matures or Copilot Workspace API ships |
| D-15 | ATS taxonomy moved from v3.0 spec to v3.3 epic | Keep in v3.0 spec | Per reviewer: v3.0 doesn't add new generation paths, so it doesn't need the sanitizer or the full GREEN/YELLOW/RED rules. Keeps v3.0 spec focused. Full taxonomy preserved in [#44](https://github.com/olafkfreund/rolehunter/issues/44) |
| D-16 | v3.5 expanded from "Signals & negotiation" to "Recruiter Communication & Automation Hub": email IMAP/SMTP, Telegram bot, WhatsApp receive-only, 10-stage recruiter funnel model, draft+human-review for ALL outbound. v3.4 expanded with interview transcripts (Whisper) + testing-platform email tracking (coaching only). Per user 2026-05-31. | Silent auto-reply / WhatsApp auto-send / testing-platform auto-solve | Silent auto-reply hallucinations have unbounded downside (wrong promises, leaked info). WhatsApp account-ban risk is real and propagates across Meta. Auto-solving tests is fraud. Draft-with-review + receive-only WhatsApp + coaching-only testing gets ~80% of the value with ~5% of the risk. See epics [#45](https://github.com/olafkfreund/rolehunter/issues/45) + [#46](https://github.com/olafkfreund/rolehunter/issues/46) |
| D-17 | "Humanize" = make output prose itself less AI-sounding via style rules, NOT match user's personal voice from their writing samples. Implementation: shared `SYSTEM_HUMANIZE_GUARDRAILS` system-prompt block prepended to every generation that produces user-facing prose (cover letter, recruiter reply, application form free-text). Rules: ban LLM-tell phrases ("thrilled", "delve into", "robust", "tapestry", "in today's fast-paced", "leveraged"), em-dash cap, sentence-length variance, concrete-specificity (every claim has a number/name/date/fact), active voice, no bullet-flood, one personal anecdote per cover letter. Applied at v2.4 prompt level + v3.3 sanitizer + v3.5 outbound generation. Per user clarification 2026-05-31. | Voice-matching from user's sent folder / portfolio (original D-16 interpretation) | Voice-matching is harder, slower, more brittle, and may amplify any AI-tells already in the user's prior output. Anti-AI-tell rules are universally applicable, cheap, and immediately effective. They can compose with voice-matching later if useful. |
| D-18 | v3.2 substantially expanded from "Glassdoor + layoffs" stub to a full company-intel & enrichment system: commute (geocoded offices + Google Maps), days-in-office policy, benefits package (health/dental/401k or pension/PTO/parental leave/stipends), Glassdoor + Blind + Levels.fyi + NewsAPI + Crunchbase + layoffs.fyi + LinkedIn Company scraper, per-user-weighted fit score. Per user input 2026-05-31. | Keep v3.2 narrow / fold into v3.0 | These are decision-grade signals when choosing where to work; arguably as important as the CV-match score itself. Belongs in v3.2 not v3.0 because (a) requires a `companies` table not in v3.0 schema, (b) cost: needs Apify budget headroom + new API keys, (c) v3.0 jobs must exist before there's anything to enrich. Full scope in epic [#43](https://github.com/olafkfreund/rolehunter/issues/43) |
