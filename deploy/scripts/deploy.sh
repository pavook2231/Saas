#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

if [ ! -f .env.production ]; then
  echo ".env.production is required" >&2
  exit 1
fi

retry_compose_up_remove_orphans() {
  local attempt
  local max_attempts=5

  for attempt in $(seq 1 "${max_attempts}"); do
    local output=""
    local status=0

    set +e
    output="$(
      docker compose --env-file .env.production up -d backend frontend nginx --remove-orphans 2>&1
    )"
    status=$?
    set -e

    printf '%s\n' "${output}"

    if [ "${status}" -eq 0 ]; then
      return 0
    fi

    if grep -Eq 'removal of container .* is already in progress' <<<"${output}"; then
      if [ "${attempt}" -lt "${max_attempts}" ]; then
        local delay=$((attempt * 2))
        echo "Docker is still removing an old container. Retrying in ${delay}s..." >&2
        sleep "${delay}"
        continue
      fi
    fi

    return "${status}"
  done
}

mkdir -p backups/postgres

docker compose --env-file .env.production up -d --wait postgres redis

"${ROOT_DIR}/deploy/scripts/backup-db.sh"

docker compose --env-file .env.production --profile ops build --pull backend frontend migrator
docker compose --env-file .env.production --profile ops run --rm migrator
retry_compose_up_remove_orphans

docker compose --env-file .env.production ps
