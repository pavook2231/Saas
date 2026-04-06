#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

if [ ! -f .env.production ]; then
  echo ".env.production is required" >&2
  exit 1
fi

docker compose --env-file .env.production --profile ops run --rm certbot \
  renew \
  --webroot \
  --webroot-path /var/www/certbot \
  --quiet

docker compose --env-file .env.production restart nginx

echo "Certificates renewed and nginx restarted"
