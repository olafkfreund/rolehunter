# Development guide

For contributors. Everything you need to extend the app locally.

## Stack

- **Framework** Next.js 15, App Router, TypeScript strict, React 19.
- **Database** PostgreSQL 16 (pgvector image, though no pgvector usage yet).
- **ORM** Drizzle ORM with `drizzle-kit` for generate + migrate.
- **LLM** Anthropic SDK (`@anthropic-ai/sdk`) and Google Gen AI SDK (`@google/genai`) behind a single `LlmProvider` interface.
- **PDF** Playwright-driven headless Chromium.
- **Styling** Tailwind CSS v4 with CSS variable tokens.
- **Tables** TanStack Table v8 on `/applications` and `/gaps`.
- **DnD** `@dnd-kit/core` on the Applications board view.
- **Toasts** `sonner`.
- **Deps** `zod` for validation, `sharp` for image resize, `lucide-react` for icons, `react-markdown` + `remark-gfm`.

## Directory layout

```
rolehunter/
  Dockerfile                 multi-stage image; Chromium baked in, runs as `nextjs` user
  docker-compose.yml         app + db, both bound to 127.0.0.1
  scripts/
    setup.sh                 one-shot env generation (random free ports)
    backup.sh                pg_dump + uploads tar
  src/
    app/
      api/                   route handlers grouped by feature
      <page>/                server components per route
    components/
      dashboard/             dashboard section components
      gaps/                  /gaps UI
      applications/          /applications table and row editors
      *.tsx                  shared panels (match, cv-rewrite, interviews, flashcards, ...)
    lib/
      db/
        schema.ts            Drizzle schema, single source of truth
        migrations/          generated .sql files (DO NOT edit by hand)
        index.ts             getDb() pool singleton
      repo/                  one file per aggregate (cv, jobs, matches, applications, gaps, ...)
      llm/
        types.ts             LlmProvider interface + result types
        prompts.ts           every SYSTEM_* prompt string
        claude.ts            Anthropic SDK impl
        gemini.ts            Google Gen AI SDK impl
        index.ts             getProvider(name) factory with fallback
      pdf/
        cv-html.ts           CV renderer with themes, avatar embedding, dedup helpers
        cover-letter-html.ts shared cover-letter renderer
        render.ts            Playwright singleton wrapper
        avatar.ts            reads profile.avatarPath, returns data URI
      jsearch/client.ts      RapidAPI JSearch wrapper
      linkedin/              RapidAPI Fantastic Jobs wrapper + normalise
      api.ts                 wrap() helper for structured error JSON
      env.ts                 zod-validated environment access
  doc/
    onboarding.md
    starting.md
    development.md           you are here
    scripts/capture-screenshots.mjs   Playwright doc-screenshotter
```

## Running without Docker (dev server)

Drop `NODE_ENV` on the host to let npm install devDependencies, then point the app at your containerised Postgres.

```bash
unset NODE_ENV
npm install
source .env
DATABASE_URL="postgres://rolehunter:${DB_PASSWORD}@127.0.0.1:${DB_PORT}/rolehunter" \
  npx drizzle-kit migrate
npm run dev
```

`next dev` uses the same env vars. Playwright Chromium on the host won't match the container's version, so PDF export will fail in dev — run `npx playwright install chromium` if you need it.

## Adding a database column or table

1. Edit `src/lib/db/schema.ts`.
2. Regenerate: `unset NODE_ENV && DATABASE_URL=... npx drizzle-kit generate`. This writes a new `.sql` to `src/lib/db/migrations/`.
3. Read the generated SQL, add any backfill statements manually if needed.
4. Apply: `DATABASE_URL=... npx drizzle-kit migrate`.
5. Rebuild the container so the new migration ships: `docker compose up -d --build app`.

The runner stage bundles the migrations folder, so on first container start the migrations directory is there for `drizzle-kit migrate` to apply.

## Adding an LLM method

1. Define the result type in `src/lib/llm/types.ts` and add the method to `LlmProvider`.
2. Write a `SYSTEM_*` prompt in `src/lib/llm/prompts.ts`. Return ONLY JSON to keep parsing simple. Include good/bad examples inline for tricky prompts (see `SYSTEM_REWRITE_CV`).
3. Implement in both `src/lib/llm/claude.ts` and `src/lib/llm/gemini.ts`. Both files import `parseJson` from their own local helper; match the existing pattern.
4. Budget output tokens conservatively — Claude Sonnet 4.6 caps at 64K output, Gemini 2.5 Pro at 65K, but cap yours to what the prompt realistically needs plus a 1.5x safety margin. Truncation produces invalid JSON and the route will surface a helpful error via `wrap()`.

Call sites look like `getProvider(provider).myMethod(...)`. The factory auto-falls back to the other provider if the requested one's API key is empty.

## Adding an API route

1. Create `src/app/api/<path>/route.ts`.
2. Export HTTP methods wrapped in `wrap()` from `@/lib/api`:

   ```ts
   import { NextResponse } from "next/server";
   import { z } from "zod";
   import { wrap } from "@/lib/api";

   export const runtime = "nodejs";
   export const maxDuration = 60;   // for LLM-calling routes, use 120 or 180

   const body = z.object({ ... });

   export const POST = wrap(async (req: Request) => {
     const parsed = body.safeParse(await req.json());
     if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
     const result = await myRepoFunction(parsed.data);
     return NextResponse.json(result);
   });
   ```

3. For dynamic routes, Next 15 async params:

   ```ts
   export const PATCH = wrap(async (req, ctx: { params: Promise<{ id: string }> }) => {
     const { id } = await ctx.params;
     ...
   });
   ```

4. Client code parses responses defensively:

   ```ts
   const text = await res.text();
   const json = text ? JSON.parse(text) : null;
   if (!res.ok) throw new Error(json?.error ?? `failed (${res.status})`);
   ```

   `wrap()` guarantees every error comes back as `{ error: "..." }` so this pattern never hits "Unexpected end of JSON input".

## Adding a page

1. `src/app/<route>/page.tsx` as a server component, `export const dynamic = "force-dynamic"` when it reads DB.
2. Fetch data via repo functions, pass as props to client components.
3. Add to the nav array in `src/app/layout.tsx`.

## Coding conventions

- TypeScript strict, no `any`. Use `unknown` and narrow with predicates or zod.
- No emoji in source or docs unless the user explicitly asks.
- Tailwind tokens, not hex: `bg-[var(--background)]`, `text-[var(--muted-foreground)]`, `border-[var(--border)]`, `text-[var(--accent)]`, `text-[var(--success)]`, `text-[var(--warning)]`, `text-[var(--danger)]`.
- Client errors go through `sonner`'s `toast.error(...)`; never `console.error` only.
- Radix primitives for any dialog, dropdown, tabs, select.

## Testing

There is no automated test suite yet. Manual smoke test after any change:

```bash
unset NODE_ENV
npx next build                                             # type-check + build
docker compose up -d --build app
source .env
curl -s http://127.0.0.1:${APP_PORT}/api/health            # expect providers true where keys set
```

Follow-up issue: [add GitHub Actions CI for typecheck + build](https://github.com/olafkfreund/rolehunter/issues).

## Regenerating doc screenshots

The 11 page screenshots are captured by `doc/scripts/capture-screenshots.mjs` using the container's baked-in Playwright. Before running, swap the profile to dummy values (`Jane Doe` / `jane.doe@example.com` / clear `avatarPath`) so nothing personal lands in the images. After running, restore the real profile.

```bash
docker cp doc/scripts/capture-screenshots.mjs rolehunter-app-1:/app/capture.mjs
docker compose exec -T app sh -c 'cd /app && mkdir -p /app/shots && APP_URL=http://127.0.0.1:3000 OUT_DIR=/app/shots node capture.mjs'
docker compose cp app:/app/shots /tmp/shots
cp /tmp/shots/*.png doc/images/
```

## Where to look for known follow-ups

All unimplemented items are filed as issues on the repo:

- `enhancement,ai` — LLM-side features (gap flashcards, insert-bullet sidebar, pgvector canonicalisation).
- `enhancement,ux` — UX polish (two-column Modern CV, multi-select bulk actions).
- `enhancement,integration` — third-party integrations (`.ics` export, email send, LinkedIn clipper).
- `infra` — CI, Docker publish, retries, backups.
- `accessibility` — a11y audit across tables and modals.

PRs welcome. Keep them tight and scoped to one issue where possible.
