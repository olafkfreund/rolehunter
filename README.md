# RoleHunter

Self-hosted, single-user AI job-matching portal.

- Paste a job description or pull listings from JSearch.
- Score each role 0–100 against your master CV with Claude or Gemini.
- See strengths, gaps, and reasoning.
- Auto-rewrite your CV for each role and export an ATS-safe PDF.
- Track applications on a Kanban board.
- Optimize your LinkedIn headline/About for target roles.

Runs as two containers (Next.js + Postgres) bound to 127.0.0.1 on random, stable-after-setup ports.

## Quickstart

```bash
./scripts/setup.sh            # generates .env with random free ports and a DB password
$EDITOR .env                  # paste ANTHROPIC_API_KEY / GEMINI_API_KEY / JSEARCH_RAPIDAPI_KEY
docker compose up --build -d
docker compose exec app npx drizzle-kit migrate
source .env && echo "Open http://127.0.0.1:${APP_PORT}"
```

To access from another machine, use an SSH tunnel — the app is intentionally bound to loopback.

## Stack

Next.js 15 · React 19 · TypeScript · Tailwind v4 · Drizzle ORM · PostgreSQL 16 (pgvector) · Playwright (PDF) · Anthropic + Google GenAI SDKs · dnd-kit.

## Backup / restore

```bash
./scripts/backup.sh           # writes backups/YYYYMMDD-HHMMSS/{rolehunter.sql.gz,uploads.tar.gz}
```

To restore, pipe the SQL into `docker compose exec -T db psql -U rolehunter rolehunter` and extract the tar into the `rolehunter_uploads` volume.
