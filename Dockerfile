ARG NODE_VERSION=22-bookworm-slim

# --- deps layer ---
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --include=dev --force

# --- migrator layer ---
# Lean image used by the Kubernetes migrate Job (deploy/k8s/job-migrate.yaml)
# to apply Drizzle migrations against the in-cluster Postgres before the app
# rolls out. Reuses the full node_modules from `deps` (drizzle-orm + pg are
# both there) and ships only the migration runner + SQL — no Next.js build,
# no Playwright/Chromium. Published as ghcr.io/olafkfreund/rolehunter-migrator.
FROM node:${NODE_VERSION} AS migrator
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY scripts/migrate.mjs ./scripts/migrate.mjs
COPY src/lib/db/migrations ./src/lib/db/migrations
CMD ["node", "scripts/migrate.mjs"]

# --- build layer ---
FROM node:${NODE_VERSION} AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN mkdir -p /ms-playwright && npx playwright install chromium
RUN npm run build

# --- runner layer ---
FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV UPLOAD_DIR=/app/uploads
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Chromium + font runtime deps (Debian bookworm)
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl wget gnupg \
      libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
      libdbus-1-3 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
      libxext6 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 \
      libasound2 libatspi2.0-0 libxshmfence1 libgtk-3-0 \
      fonts-liberation fonts-dejavu fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd -g 1001 nodejs && useradd -m -u 1001 -g nodejs nextjs \
 && mkdir -p /ms-playwright /app/uploads/avatars /app/uploads/cvs-master /app/uploads/cvs-variants \
 && chown -R nextjs:nodejs /ms-playwright /app

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# Migrations are applied at deploy time with `node scripts/migrate.mjs`, which
# uses the same node-postgres driver as the app (drizzle-orm + pg, both present
# in the standalone runtime). drizzle-kit is intentionally not shipped here — it
# drags in esbuild and only its config-parsing is needed, which we avoid.
COPY --from=builder --chown=nextjs:nodejs /app/src/lib/db/migrations ./src/lib/db/migrations
COPY --from=builder --chown=nextjs:nodejs /app/scripts/migrate.mjs ./scripts/migrate.mjs
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/drizzle-orm ./node_modules/drizzle-orm
COPY --from=builder --chown=nextjs:nodejs /ms-playwright /ms-playwright

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
