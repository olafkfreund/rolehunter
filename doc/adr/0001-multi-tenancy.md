# ADR 0001 — Multi-tenancy model

> Created: 2026-06-13
> Status: Accepted
> Tracking epic: [#97](https://github.com/olafkfreund/rolehunter/issues/97)
> Decision issue: [#98](https://github.com/olafkfreund/rolehunter/issues/98)
> Supersedes: nothing (first ADR)

## Context

RoleHunter today is a **single-user, self-hosted** app. There is no
authentication, a singleton `profile` row, and **zero `tenant_id` / `user_id`
columns** across all 29 tables. Every API route (67 files) queries globally;
uploads, LLM keys, budgets, and the scheduler are all global singletons.

Epic [#97](https://github.com/olafkfreund/rolehunter/issues/97) proposes turning
this into a multi-tenant platform. Before any of its eight phases can start, three
decisions gate the entire downstream scope. This ADR records those three
decisions and the conventions that follow from them.

The strategic frame for this decision: **RoleHunter stays a personal /
self-hosted product.** The goal of multi-tenancy here is *isolated logins so a
household or a handful of trusted users can each have their own private
workspace on one deployment* — not a public, billed SaaS. That frame is what
sets D2 below.

## Decisions

### D1 — Tenant model: **tenant == individual user (B2C)**

A tenant is a single user. There are no organizations, teams, seats, or RBAC.

- A `users` table holds identity; **one `profile` row per tenant** (replacing the
  current singleton).
- We still store the tenant key as **`tenant_id uuid`**, not `user_id` — even
  though tenant and user are 1:1 today. This keeps the door open to a future
  org/team model (a `tenant_id` could later map to an organization) without a
  second painful column migration across every table. The column name encodes
  the *isolation boundary*, not the *identity*.

**Rejected:** org/team (B2B) model with memberships + roles. It adds a
`organizations` / `memberships` / `roles` layer and RBAC throughout the repo
layer for zero current benefit — there is no team buying this. Revisit only if
the product direction changes (would be a new ADR superseding this one).

### D2 — Cost model: **BYO-key (bring-your-own API key); no billing**

Each tenant supplies their own provider API keys (Anthropic / Gemini / OpenAI /
Ollama endpoint, Apify, RapidAPI, etc.). The platform never pays for a tenant's
LLM or scraping usage, so there is **no usage metering, no Stripe, no plans, and
no billing**.

Consequences:

- **Epic #97 Phase 6 / issue [#104](https://github.com/olafkfreund/rolehunter/issues/104)
  (Billing & usage metering) is OUT OF SCOPE.** It should be closed as
  `not planned` (or left open but explicitly de-scoped) referencing this ADR.
- Per-tenant API keys live in a **per-tenant, encrypted** `app_settings`
  (Phase 4 / [#102](https://github.com/olafkfreund/rolehunter/issues/102)). The
  existing global plaintext key storage is replaced.
- The existing `source_budgets` / `source_quotas_daily` cost-rail tables are
  **retained and rescoped per tenant** — not for billing, but as *self-imposed
  spend guardrails* so one tenant's runaway scheduler can't burn their own
  Apify/LLM budget. These are caps the tenant sets on their own keys, not
  charges we levy.

**Rejected:** platform-key + usage metering + Stripe billing. That is the
sellable-SaaS path; it pulls in Stripe lifecycle, plan enforcement, overage
handling, and a much larger cost-blast-radius risk surface. Out of scope for a
personal/self-hosted product. Choosing this later would be a new ADR and would
re-open #104.

### D3 — Isolation model: **pooled Postgres + `tenant_id` + Row-Level Security (RLS)**

One shared database. Every isolated table carries `tenant_id uuid NOT NULL`
(indexed), and **Postgres RLS policies** enforce isolation as a hard backstop
even if an application query forgets its `WHERE tenant_id = …`.

- Tenant context is set per transaction: `SET app.tenant_id = '<uuid>'`, and RLS
  policies filter `USING (tenant_id = current_setting('app.tenant_id')::uuid)`.
- Scoping is applied at the **repo-layer boundary** (`src/lib/repo/*`), not
  sprinkled across all 67 routes. A single `getTenant()` / `requireSession()`
  helper resolves the current tenant; the repo layer threads it and sets the GUC.
- This mirrors the `set_tenant_context` pattern already proven in the SkillAi
  codebase.

**Rejected:** schema-per-tenant or database-per-tenant. For a small,
self-hosted user count these add migration fan-out (run every migration N times),
connection-pool pressure, and operational weight with no isolation benefit over
RLS at this scale. Pooled + RLS is defense-in-depth at the right cost.

## Conventions that follow

### `tenant_id` convention

- Type: **`uuid NOT NULL`**, generated server-side at tenant provisioning.
- Present on every **isolated** table (see split policy below), always indexed.
- Named `tenant_id` everywhere (never `user_id`, never `owner_id`) for grep-ability
  and to encode the isolation boundary.
- All schema changes go through **`drizzle-kit generate`** — never hand-edited
  SQL. The migration journal currently lags `schema.ts`
  (epic #97 risk #5); that gap must be reconciled **before** the Phase 2
  `tenant_id` migration lands, or the generated diff will be wrong.

### Global-cache vs tenant-data split policy

Not every table gets a `tenant_id`. The dividing line is **fact vs judgment**:

| Class | Rule | Examples |
|-------|------|----------|
| **Global read-only cache** | Expensive-to-fetch *external facts* that are identical for everyone. **No `tenant_id`.** Shared across all tenants. | `companies`, `company_*` enrichment, raw `job_listings` (the posting itself) |
| **Tenant-scoped data** | Anything that is *this user's* content or *this user's* judgment about the world. **Has `tenant_id` + RLS.** | `profile`, `cv_master`, `cv_variants`, `matches` (fit scores), `applications`, `interviews`, `interview_feedback`, `cover_letters`, `cover_letter_templates`, `flashcards`, `portfolio_items`, `linkedin_scans`, `search_profiles`, `search_runs`, `app_settings`, `source_budgets`, `source_quotas_daily`, `canonical_gaps*` |

Practical consequence: a job posting is fetched once and shared, but **whether a
tenant has saved / hidden / applied-to / scored that job is tenant-scoped**.
Where today a flag like `applied` or `hidden` lives directly on a shared job row,
Phase 2 must move that judgment into a tenant-scoped join table (e.g.
`tenant_job_state(tenant_id, job_listing_id, saved, hidden, applied, …)`), so the
shared cache row stays free of per-tenant state.

## Scope impact summary

| Epic #97 phase | Issue | Status after this ADR |
|----------------|-------|-----------------------|
| 0 — Decisions & ADR | [#98](https://github.com/olafkfreund/rolehunter/issues/98) | **Done** (this doc) |
| 1 — Auth & tenant context | [#99](https://github.com/olafkfreund/rolehunter/issues/99) | In scope |
| 2 — Data isolation + RLS | [#100](https://github.com/olafkfreund/rolehunter/issues/100) | In scope |
| 3 — File storage isolation | [#101](https://github.com/olafkfreund/rolehunter/issues/101) | In scope |
| 4 — Per-tenant secrets (encrypted) | [#102](https://github.com/olafkfreund/rolehunter/issues/102) | In scope (BYO-key UI) |
| 5 — Jobs & per-tenant quotas | [#103](https://github.com/olafkfreund/rolehunter/issues/103) | In scope (self-imposed caps) |
| 6 — Billing & metering | [#104](https://github.com/olafkfreund/rolehunter/issues/104) | **OUT OF SCOPE** (D2 = BYO-key) |
| 7 — Infra hardening | [#105](https://github.com/olafkfreund/rolehunter/issues/105) | Reduced: needs multi-user reachability, **not** public-internet SaaS hardening |
| 8 — Security & GDPR | [#106](https://github.com/olafkfreund/rolehunter/issues/106) | In scope (RLS audit + per-tenant export/delete) |

Minimal target: **isolated logins, BYO-key, no billing** — critical path
#99 → #100 → #101 / #102 in parallel → #106. Estimated ~3–4 weeks (per epic #97).

## Consequences

**Positive**

- Smallest build that delivers private per-user workspaces on one deployment.
- RLS gives a hard PII-isolation backstop (CVs, names, job history are personal
  data) independent of application-query correctness.
- `tenant_id uuid` from day one keeps a future org model migration cheap.
- No Stripe / metering surface to build, secure, or maintain.

**Negative / trade-offs**

- BYO-key means each user must obtain and paste their own API keys — higher
  onboarding friction than a platform-key product. Acceptable for a
  self-hosted/technical audience.
- Pooled DB means a single noisy tenant's queries share the same Postgres
  instance; mitigated by per-tenant self-caps (Phase 5) and, if needed later,
  Phase 7 pooling.
- The global-cache / tenant-state split adds a join table and migration work in
  Phase 2 that a naive "tenant_id on everything" approach would skip — but the
  naive approach would duplicate the entire job/company corpus per tenant.

## Status of epic #97 decision checkboxes

- [x] **D1** — Tenant model: tenant == individual user
- [x] **D2** — Cost model: BYO-key (billing out of scope)
- [x] **D3** — Isolation: pooled + RLS
