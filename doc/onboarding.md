# Onboarding

## What RoleHunter is

A single-user, self-hosted job-hunt workspace. It ingests job postings (paste or via the JSearch / LinkedIn APIs on RapidAPI), scores each role against your master CV with Claude or Gemini, tailors a per-role CV and cover letter, tracks applications and interviews, and aggregates the skill gaps that keep showing up across the roles you score so you can close them.

Everything runs in two Docker containers on your own machine. There is no multi-tenancy, no cloud, no analytics. The app binds to `127.0.0.1` on a random port chosen at setup.

## Prerequisites

- Docker Engine 20+ and Docker Compose v2.
- An Anthropic API key (`sk-ant-...`) or a Google AI Studio key, or both.
- Optional: a RapidAPI key if you want live JSearch and LinkedIn job search. Paste-only ingestion works without it.
- Roughly 2 GB free disk for the app image (Chromium is pre-baked) and another 1 GB for the Postgres volume.

No Node, no Postgres, no Playwright on the host. Everything is in the container.

## Install and first run

```bash
git clone https://github.com/olafkfreund/rolehunter.git
cd rolehunter
./scripts/setup.sh           # picks two random free ports, writes .env
$EDITOR .env                 # paste ANTHROPIC_API_KEY / GEMINI_API_KEY / JSEARCH_RAPIDAPI_KEY
docker compose up -d --build
docker compose exec app node scripts/migrate.mjs   # or run from host; see development.md
```

`setup.sh` prints the URL at the end, something like:

```
App:      http://127.0.0.1:44639
Postgres: 127.0.0.1:33697
```

Bookmark that URL. The ports are chosen once and stay stable across restarts.

## What you see on first visit

![Dashboard](images/01-dashboard.png)

A command center with zeros across every metric. Four sections populate as you use the app:

- **Upcoming interviews** and **Action queue** — empty until you schedule interviews and track applications.
- **Top scored roles** — populated after you score any job.
- **Latest tailored CV** — shows the most recent per-role CV variant you generated.
- **Feedback patterns** — builds a rejection-category donut once you have two or more logged feedback entries.

## Recommended first-time flow

1. **Set your profile.** Open `/profile`, upload a photo, paste your email / phone / location, and either upload a PDF of your LinkedIn profile (one click on linkedin.com → `More → Save to PDF`) or paste your CV as markdown. The parser extracts structured data used by every downstream feature.

   ![Profile](images/02-profile.png)

2. **Add your first job.** On `/jobs`, pick a source (JSearch, LinkedIn, or Both) and run a search, or paste a job description.

   ![Jobs list](images/03-jobs-list.png)

3. **Score it.** Click any job to open its detail page. Click **Score this role**.

   ![Job detail](images/04-job-detail.png)

4. **Tailor a CV for it.** Click **Rewrite CV for this role**, then **Download PDF**. Switch between Modern (accent colour, photo top-right) and Classic (ATS-conservative black and white) in one click.

5. **Generate a cover letter.** Same pattern; the sticky bar at the top of the job page has a one-click **Generate cover letter** button that does POST + PDF export in one go.

6. **Track it.** Click **Track** on the job card or the detail page. It appears in `/applications` with stage "Saved".

7. **Score more jobs**, then open `/gaps` and click **Refresh from matches**. Claude or Gemini clusters the skill-gap strings across every match you have, and the top gaps surface with a **Learn** drawer full of curated documentation links.

## Where your data lives

- `uploads/` inside the `rolehunter_uploads` Docker volume — avatar, master-CV PDFs, per-role tailored PDFs, cover-letter PDFs.
- Everything else in Postgres, inside the `rolehunter_pgdata` volume.

Both are backed up by `scripts/backup.sh` which produces a timestamped folder with a `pg_dump.sql.gz` and a `uploads.tar.gz`.

## Next

- [Starting guide](starting.md) — one section per page, what each button does.
- [Development guide](development.md) — run locally without Docker, add an LLM method, extend the schema.
