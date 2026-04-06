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

: "${DOMAIN_NAME:?DOMAIN_NAME is required in .env.production}"
: "${LETSENCRYPT_EMAIL:?LETSENCRYPT_EMAIL is required in .env.production}"

"${ROOT_DIR}/deploy/scripts/deploy.sh"

docker compose --env-file .env.production --profile ops run --rm certbot \
  certonly \
  --webroot \
  --webroot-path /var/www/certbot \
  --email "${LETSENCRYPT_EMAIL}" \
  --agree-tos \
  --no-eff-email \
  --non-interactive \
  -d "${DOMAIN_NAME}"

docker compose --env-file .env.production restart nginx

echo "Let's Encrypt certificate issued for ${DOMAIN_NAME}"
