#!/usr/bin/env bash
# scripts/backup.sh — snapshot Postgres + uploads volume.
set -euo pipefail

cd "$(dirname "$0")/.."

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="backups/${STAMP}"
mkdir -p "${OUT_DIR}"

docker compose exec -T db pg_dump -U rolehunter rolehunter \
  | gzip > "${OUT_DIR}/rolehunter.sql.gz"

docker run --rm \
  -v rolehunter_uploads:/uploads:ro \
  -v "$(pwd)/${OUT_DIR}":/out \
  alpine sh -c "cd /uploads && tar -czf /out/uploads.tar.gz ."

echo "Backup written to ${OUT_DIR}/"
