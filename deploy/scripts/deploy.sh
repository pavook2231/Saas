#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

if [ ! -f .env.production ]; then
  echo ".env.production is required" >&2
  exit 1
fi

mkdir -p backups/postgres

docker compose --env-file .env.production up -d --wait postgres redis

"${ROOT_DIR}/deploy/scripts/backup-db.sh"

docker compose --env-file .env.production build --pull backend frontend
docker compose --env-file .env.production --profile ops run --rm migrator
docker compose --env-file .env.production up -d backend frontend nginx --remove-orphans

docker compose --env-file .env.production ps
