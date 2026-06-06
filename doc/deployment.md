# Deployment (Kubernetes / k3d on p510)

RoleHunter runs on the **k3d cluster on the `p510` host**, deployed and kept in
sync by **ArgoCD** using the GitOps repo
[`factory-gitops`](https://github.com/olafkfreund/factory-gitops). Nothing is
applied by hand — you commit manifests to git and ArgoCD reconciles them onto the
cluster.

> Local development still uses `docker compose` (see
> [Development](development.md)). This page covers the **cluster** deployment.

## Topology

```
                 ┌──────────────────────────── p510 (k3d cluster `factory`) ──────────────────────────┐
                 │  namespace: factory                                                                 │
 GitHub          │                                                                                     │
 ┌────────────┐  │   ArgoCD ── app-of-apps ──► Application "rolehunter"                                 │
 │ rolehunter │  │                                   │  (source: rolehunter repo, path deploy/k8s)     │
 │  repo      │──┼──► deploy/k8s (kustomize) ────────┤                                                  │
 └────────────┘  │                                   ▼                                                  │
       │ push     │   wave 0  StatefulSet rolehunter-db  (pgvector/pgvector:pg16, local-path PVC)        │
       ▼          │   wave 1  Job        rolehunter-migrate (drizzle migrate, Sync hook)                 │
 GitHub Actions   │   wave 2  Deployment rolehunter-app  ┌─ app (Next.js :3000)                          │
 deploy-image.yml │                                      └─ tailscale sidecar ──► https://rolehunter.tail833f7.ts.net
   builds GHCR     │   PVC rolehunter-uploads (/app/uploads)                                             │
   images         └─────────────────────────────────────────────────────────────────────────────────┘
```

## How it's wired (two repos)

| Layer | Where | What |
|---|---|---|
| ArgoCD pointer | `factory-gitops/apps/rolehunter/application.yaml` | An ArgoCD `Application` pointing at this repo's `deploy/k8s`, `targetRevision: main`, namespace `factory`, automated sync (prune + selfHeal). |
| Manifests | `rolehunter/deploy/k8s/` (kustomize) | The actual StatefulSet / Job / Deployment / Services / PVC / ConfigMap. |
| Image build | `rolehunter/.github/workflows/deploy-image.yml` | Builds + pushes `ghcr.io/olafkfreund/rolehunter` and `-migrator` to GHCR. |

Add the app once by committing `apps/rolehunter/application.yaml` to factory-gitops;
the ArgoCD root app discovers it within ~3 minutes.

## What gets deployed

| Object | Kind | Notes |
|---|---|---|
| `rolehunter-db` | StatefulSet + headless Service | `pgvector/pgvector:pg16`, 8Gi `local-path` PVC, **sync-wave 0**. A `/dev/shm` Memory emptyDir avoids the Postgres "Bus error" on initdb under k3d's tiny default shm. |
| `rolehunter-migrate` | Job (ArgoCD `Sync` hook, **wave 1**) | Runs `node scripts/migrate.mjs` (Drizzle). Idempotent; re-runs each sync. An init-container waits for the DB. |
| `rolehunter-app` | Deployment + Service | Next.js standalone + Tailscale sidecar, **sync-wave 2**, `Recreate` strategy (RWO uploads PVC). Background scheduler enabled. |
| `rolehunter-uploads` | PVC | 5Gi `local-path` for uploaded/generated CVs + PDFs. |
| `rolehunter-tailscale-serve-config` | ConfigMap | Tailscale `serve` config: `:443` → app `:3000`. |

Sync-waves guarantee ordering: **DB → migrations → app**.

## Networking — no Ingress

The factory cluster has **no Ingress controller**. Each app pod runs a
**Tailscale sidecar** (userspace mode) that terminates HTTPS on `:443` with a
cert auto-issued for the tailnet hostname and proxies to the app on
`127.0.0.1:3000`. RoleHunter is reachable on the freundcloud tailnet at:

**https://rolehunter.tail833f7.ts.net**

See `factory-gitops/docs/sidecar-pattern.md` for the full pattern.

## Secrets (seeded out-of-band — never in git)

Three namespace-scoped Secrets must exist in `factory` before the first sync:

- **`rolehunter-db`** — `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
- **`rolehunter-app`** — `DATABASE_URL` (required) plus the optional provider keys
  (`ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `JSEARCH_RAPIDAPI_KEY`,
  `ADZUNA_APP_ID`/`ADZUNA_APP_KEY`, `APIFY_API_TOKEN`, `GOOGLE_MAPS_API_KEY`, …).
  `DATABASE_URL` points at the in-cluster service:
  `postgres://rolehunter:<pw>@rolehunter-db:5432/rolehunter`.
- **`tailscale-auth-key`** (`TS_AUTHKEY`) and **`ghcr-pull`** (image pull secret)
  are already present cluster-wide; you don't create them per app.

Exact `kubectl create secret` commands are in
[`deploy/k8s/README.md`](https://github.com/olafkfreund/rolehunter/blob/main/deploy/k8s/README.md).
See [`src/lib/env.ts`](https://github.com/olafkfreund/rolehunter/blob/main/src/lib/env.ts)
for the full validated env schema.

## Images

`deploy-image.yml` builds two targets from the multi-stage `Dockerfile`:

- `ghcr.io/olafkfreund/rolehunter` — `runner` (the Next.js app)
- `ghcr.io/olafkfreund/rolehunter-migrator` — `migrator` (Drizzle migrate runner)

Tags: the branch name and the commit SHA. Bump the deployed tag in
`deploy/k8s/kustomization.yaml` (`images:`); pin an immutable `:<sha>` for
production rollouts. Pods pull via the `ghcr-pull` imagePullSecret.

## Operating it

```bash
# Status (run with kubectl pointed at the p510 cluster)
kubectl -n factory get pods,statefulset,deploy,job,pvc -l app.kubernetes.io/part-of=rolehunter

# Migration logs
kubectl -n factory logs job/rolehunter-migrate

# App logs
kubectl -n factory logs deploy/rolehunter-app -c app

# Health
curl -fsS https://rolehunter.tail833f7.ts.net/api/health

# Force a fresh sync (or use the ArgoCD UI)
argocd app sync rolehunter
```

A **release** = push to `main` → CI builds new GHCR images → bump the tag in
`kustomization.yaml` (or rely on `:main`) → ArgoCD syncs → the migrate Job runs →
the app rolls out.

## Notes

- This is a **fresh** deployment: the in-cluster DB starts empty and the migrate
  Job creates the schema. No data is carried over from the local compose stack.
- The DB is a single replica on node-bound `local-path` storage — appropriate for
  this single-user workload. Back up the PVC if the data later matters.
