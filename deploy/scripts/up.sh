#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="${ENV_FILE:-.env.production}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE. Copy .env.production.example and edit secrets first." >&2
  exit 1
fi

if [[ ! -d ../../app ]]; then
  echo "Expected frontend at ../../app relative to api/deploy." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE" build --pull
docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE" up -d

docker compose -f docker-compose.prod.yml ps

echo
echo "Stack is up. Verify:"
echo "  curl -fsS http://127.0.0.1/health"
echo "  open https://${APP_DOMAIN:-your-domain}"
