#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

if [ ! -f .env.production ]; then
  echo ".env.production is required" >&2
  exit 1
fi

set -a
. ./.env.production
set +a

mkdir -p backups/postgres

POSTGRES_CONTAINER_ID="$(docker compose --env-file .env.production ps -q postgres || true)"

if [ -z "${POSTGRES_CONTAINER_ID}" ]; then
  echo "Postgres container is not running yet, skipping backup"
  exit 0
fi

if ! docker compose --env-file .env.production exec -T postgres \
  pg_isready -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" >/dev/null 2>&1; then
  echo "Postgres is not ready yet, skipping backup"
  exit 0
fi

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_FILE="backups/postgres/${POSTGRES_DB}-${TIMESTAMP}.sql.gz"

docker compose --env-file .env.production exec -T postgres \
  pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --clean --if-exists \
  | gzip -c > "${BACKUP_FILE}"

echo "Backup created: ${BACKUP_FILE}"
