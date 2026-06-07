# RoleHunter — Kubernetes manifests (k3d @ p510, ArgoCD)

These manifests are deployed to the **k3d cluster on p510** by **ArgoCD**, not by
hand. The [`factory-gitops`](https://github.com/olafkfreund/factory-gitops) repo's
`apps/rolehunter/application.yaml` points its `source.path` at this directory
(`deploy/k8s`), `targetRevision: main`, into namespace `factory`. Commit here →
ArgoCD reconciles onto p510 (~3 min). Do **not** `kubectl apply` these by hand.

This is a **fresh deployment** — the in-cluster database starts empty and the
migrate Job creates the schema. No data is migrated from the local docker-compose
stack.

## What gets deployed

| Object | Kind | Notes |
|---|---|---|
| `rolehunter-db` | StatefulSet + headless Service | `pgvector/pgvector:pg16`, 8Gi `local-path` PVC, sync-wave 0, `/dev/shm` Memory emptyDir |
| `rolehunter-migrate` | Job (ArgoCD `Sync` hook, wave 1) | Drizzle migrations (`node scripts/migrate.mjs`); idempotent, re-runs each sync; waits for DB |
| `rolehunter-app` | Deployment + Service | Next.js standalone, sync-wave 2, `Recreate` (RWO uploads) |
| `rolehunter-uploads` | PVC | 5Gi `local-path` for uploaded/generated CVs + PDFs |

Public exposure is via **in-cluster cloudflared** (factory-gitops
`infra/cloudflared/`), which routes `rolehunter.<home-domain>` →
`rolehunter-app.factory.svc.cluster.local:3000`. There is **no per-app Ingress
or Tailscale sidecar** — that is the factory cluster convention.

## Sync ordering

ArgoCD sync-waves guarantee: **DB (0)** becomes healthy → **migrate Job (1)**
applies the schema → **app (2)** rolls out. The migrate Job is a `Sync` hook with
`BeforeHookCreation` delete policy, so it re-runs (idempotently) on every release.

## Required Secrets (seeded out-of-band — NOT in git)

Per factory convention, secrets are namespace-scoped and seeded via
`manage-secrets.sh` (agenix) in the `nixos_config` repo, or by hand with
`kubectl`. They are **never committed here**. Three Secrets must exist in
namespace `factory` before first sync.

### `rolehunter-db`
| Key | Value |
|---|---|
| `POSTGRES_USER` | `rolehunter` |
| `POSTGRES_PASSWORD` | *(strong password)* |
| `POSTGRES_DB` | `rolehunter` |

### `rolehunter-app`
| Key | Required? | Notes |
|---|---|---|
| `DATABASE_URL` | **yes** | `postgres://rolehunter:<pw>@rolehunter-db:5432/rolehunter` (host = the in-cluster service) |
| `ANTHROPIC_API_KEY` | optional | Claude — default LLM provider |
| `GEMINI_API_KEY` | optional | Google Gemini |
| `OPENAI_API_KEY` | optional | OpenAI |
| `JSEARCH_RAPIDAPI_KEY` | optional | JSearch / LinkedIn job search (RapidAPI) |
| `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` | optional | Adzuna job board |
| `APIFY_API_TOKEN` | optional | Apify scraping platform |
| `GOOGLE_MAPS_API_KEY` | optional | commute scoring |

> Any non-secret tuning vars (`DEFAULT_LLM_PROVIDER`, `CLAUDE_MODEL`, model
> overrides, `BUDGET_APIFY_USD_MONTHLY`, …) can also be added as keys on the
> `rolehunter-app` Secret — `envFrom` injects all of them. See
> `src/lib/env.ts` for the full validated list.

### `ghcr-pull`
Image pull secret for the private GHCR images (`dockerconfigjson`). Already
present in the `factory` namespace; the app + migrate pods reference it via
`imagePullSecrets`.

### Seeding by hand (against the p510 cluster)

The easiest way to mirror your working local stack is to source the values
straight out of the local `.env` (it already holds your real API keys and DB
password). Run on a box with `kubectl` pointed at the p510 cluster:

```bash
# DB credentials
kubectl -n factory create secret generic rolehunter-db \
  --from-literal=POSTGRES_USER=rolehunter \
  --from-literal=POSTGRES_PASSWORD='REPLACE_ME' \
  --from-literal=POSTGRES_DB=rolehunter

# App env — DATABASE_URL points at the in-cluster service, plus every API key.
kubectl -n factory create secret generic rolehunter-app \
  --from-literal=DATABASE_URL='postgres://rolehunter:REPLACE_ME@rolehunter-db:5432/rolehunter' \
  --from-literal=ANTHROPIC_API_KEY='...' \
  --from-literal=GEMINI_API_KEY='...' \
  --from-literal=OPENAI_API_KEY='...' \
  --from-literal=JSEARCH_RAPIDAPI_KEY='...' \
  --from-literal=ADZUNA_APP_ID='...' \
  --from-literal=ADZUNA_APP_KEY='...' \
  --from-literal=APIFY_API_TOKEN='...' \
  --from-literal=GOOGLE_MAPS_API_KEY='...'
```

`POSTGRES_PASSWORD` and the password inside `DATABASE_URL` must match.

## Image

Built + pushed to GHCR by [`.github/workflows/deploy-image.yml`](../../.github/workflows/deploy-image.yml):
`ghcr.io/olafkfreund/rolehunter` (runner) and
`ghcr.io/olafkfreund/rolehunter-migrator` (the `migrator` Dockerfile target).
The deployed tag is pinned in `kustomization.yaml` (`images:`) automatically by
the build workflow's GitOps write-back — it sets the immutable `:<sha>` and
commits it to `main`, which is the diff ArgoCD syncs on.

## Verify

```bash
kubectl -n factory get pods -l app.kubernetes.io/part-of=rolehunter
kubectl -n factory logs job/rolehunter-migrate
# Health (public URL is served by cloudflared; check in-cluster otherwise):
kubectl -n factory port-forward svc/rolehunter-app 3000:3000 &
curl -fsS http://localhost:3000/api/health
```
