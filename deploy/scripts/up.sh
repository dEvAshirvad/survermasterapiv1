#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="${ENV_FILE:-.env.production}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE. Copy .env.production.example and edit secrets first." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

APP_BUILD_CONTEXT="${APP_BUILD_CONTEXT:-../../surveymasterappv1}"
if [[ ! -d "$APP_BUILD_CONTEXT" ]]; then
  echo "Frontend not found at: $ROOT_DIR/$APP_BUILD_CONTEXT" >&2
  echo "Set APP_BUILD_CONTEXT in $ENV_FILE to your app repo path." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker not found. Run: sudo bash scripts/install-docker.sh" >&2
  exit 1
fi

docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE" build --pull
docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE" up -d

docker compose -f docker-compose.prod.yml ps

PUBLIC_PORT="${PUBLIC_PORT:-3000}"
VERIFY_HOST="${APP_DOMAIN:-127.0.0.1:${PUBLIC_PORT}}"

echo
echo "Stack is up. Verify:"
echo "  curl -fsS http://127.0.0.1:${PUBLIC_PORT}/health"
echo "  open http://${VERIFY_HOST}"
