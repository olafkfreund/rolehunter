# RoleHunter

Self-hosted, single-user AI job-hunt workspace. Ingests job postings, scores them
against your master CV with Claude or Gemini, tailors a per-role CV and cover
letter, tracks applications and interviews, and aggregates the skill gaps that
keep showing up across roles so you can close them.

Runs as two containers (Next.js + Postgres) bound to `127.0.0.1` on random,
stable-after-setup ports.

![Dashboard](images/01-dashboard.png)

## What it does

- **Job ingestion** — paste a description, or live-search JSearch and LinkedIn (via RapidAPI) in one query.
- **Match scoring** — Claude or Gemini return a 0–100 score with strengths, gaps, and reasoning for every role.
- **Tailored CV per role** — rewrite prompt with canonical ATS section headings, warm summary, metric-driven bullets, skill-category grouping. Modern (colour + photo) or Classic (ATS-conservative) PDF theme, switchable per variant.
- **Cover letters** — per-application, template-driven, one-click generate-and-download PDF.
- **Application tracker** — sortable/filterable table (default) or Kanban board (toggle), with inline stage/priority/excitement/last-contact/notes edits.
- **Interviews** — multi-round scheduling with type (phone, video, onsite, technical, system design, behavioral, final), prep notes, calendar-ready fields.
- **Interview flashcards** — LLM-generated behavioral (STAR), role-specific, company-specific, and technical cards per job; flip-card UI.
- **Feedback loop** — structured post-interview log (what went well / badly / to change) with rejection-category taxonomy. Dashboard surfaces patterns after two entries.
- **Cross-job gap tracker** — aggregate skill gaps across every scored role, cluster synonyms via one LLM call, and generate curated learning links restricted to a whitelist of authoritative docs sites.
- **LinkedIn SEO** — score your headline and About against a target role; get keyword coverage, suggestions, and a ready-to-paste rewrite.
- **LinkedIn PDF import** — one-click import of your own LinkedIn profile as a new active master CV.

## Documentation

- **[Onboarding](onboarding.md)** — what the app is, prerequisites, first-time setup flow.
- **[Starting guide](starting.md)** — one section per page with every control explained, all screenshots inline.
- **[Development](development.md)** — stack, directory layout, how to add columns / LLM methods / API routes / pages; coding conventions; screenshot regeneration.
- **[RoleHunter v3 design](plans/2026-05-31-rolehunter-v3-design.md)** — the design record behind the current feature set.

## Quickstart

```bash
git clone https://github.com/olafkfreund/rolehunter.git
cd rolehunter
./scripts/setup.sh            # generates .env with random free ports and a DB password
$EDITOR .env                  # paste ANTHROPIC_API_KEY / GEMINI_API_KEY / JSEARCH_RAPIDAPI_KEY
docker compose up -d --build
docker compose exec app node scripts/migrate.mjs
source .env && echo "Open http://127.0.0.1:${APP_PORT}"
```

To access from another machine, use an SSH tunnel — the app is intentionally bound to loopback.

## Stack

Next.js 15 · React 19 · TypeScript · Tailwind v4 · Drizzle ORM · PostgreSQL 16
(pgvector) · Playwright (PDF) · Anthropic and Google Gen AI SDKs · TanStack Table
· dnd-kit · sonner.
