#!/bin/sh
set -eu

: "${DOMAIN_NAME:?DOMAIN_NAME is required}"

TLS_CERT="/etc/letsencrypt/live/${DOMAIN_NAME}/fullchain.pem"

if [ -f "${TLS_CERT}" ]; then
  TEMPLATE="/etc/nginx/templates/https.conf.template"
else
  TEMPLATE="/etc/nginx/templates/http.conf.template"
fi

envsubst '${DOMAIN_NAME}' < "${TEMPLATE}" > /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'
