#!/usr/bin/env bash
# Backup MongoDB, then drop the survey database (and optionally flush Redis).
# Run from deploy/: ./scripts/db-clear.sh --yes
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="${ENV_FILE:-.env.production}"
MONGO_CONTAINER="${MONGO_CONTAINER:-dmft-mongodb}"
REDIS_CONTAINER="${REDIS_CONTAINER:-dmft-redis}"
SKIP_BACKUP=0
FLUSH_REDIS=0
CONFIRMED=0

usage() {
  cat <<'EOF'
Usage: ./scripts/db-clear.sh [options]

Backs up MongoDB, then drops the survey database. Destructive — cannot be undone
without restoring from backup.

Options:
  --yes           Skip interactive confirmation (required for automation)
  --skip-backup   Drop database without creating a backup first
  --redis         Also FLUSHALL on Redis (cache / idempotency keys)
  -h, --help      Show this help

Examples:
  ./scripts/db-clear.sh              # prompts for confirmation
  ./scripts/db-clear.sh --yes        # backup + clear
  ./scripts/db-clear.sh --yes --redis
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes) CONFIRMED=1; shift ;;
    --skip-backup) SKIP_BACKUP=1; shift ;;
    --redis) FLUSH_REDIS=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 1 ;;
  esac
done

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE. Copy .env.production.example and edit secrets first." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

DB_NAME="${MONGO_INITDB_DATABASE:-dmft_survey}"
BACKUP_DIR="$ROOT_DIR/backups"
STAMP="$(date +%F-%H%M%S)"
ARCHIVE_NAME="backup-${DB_NAME}-${STAMP}.archive"
CONTAINER_ARCHIVE="/data/db/${ARCHIVE_NAME}"

if ! docker inspect "$MONGO_CONTAINER" >/dev/null 2>&1; then
  echo "MongoDB container not found: $MONGO_CONTAINER" >&2
  echo "Is the stack running? Try: ./scripts/up.sh" >&2
  exit 1
fi

echo "Database : $DB_NAME"
echo "Container: $MONGO_CONTAINER"
echo

if [[ "$CONFIRMED" -ne 1 ]]; then
  read -r -p "This will DELETE all data in '$DB_NAME'. Type the database name to confirm: " answer
  if [[ "$answer" != "$DB_NAME" ]]; then
    echo "Aborted." >&2
    exit 1
  fi
fi

if [[ "$SKIP_BACKUP" -eq 0 ]]; then
  mkdir -p "$BACKUP_DIR"
  echo "Creating backup: $BACKUP_DIR/$ARCHIVE_NAME"
  docker exec "$MONGO_CONTAINER" mongodump \
    --username="$MONGO_INITDB_ROOT_USERNAME" \
    --password="$MONGO_INITDB_ROOT_PASSWORD" \
    --authenticationDatabase=admin \
    --db="$DB_NAME" \
    --archive="$CONTAINER_ARCHIVE"
  docker cp "${MONGO_CONTAINER}:${CONTAINER_ARCHIVE}" "${BACKUP_DIR}/${ARCHIVE_NAME}"
  docker exec "$MONGO_CONTAINER" rm -f "$CONTAINER_ARCHIVE"
  echo "Backup saved."
else
  echo "Skipping backup (--skip-backup)."
fi

echo "Dropping database '$DB_NAME'..."
docker exec "$MONGO_CONTAINER" mongosh \
  "mongodb://${MONGO_INITDB_ROOT_USERNAME}:${MONGO_INITDB_ROOT_PASSWORD}@localhost:27017/${DB_NAME}?authSource=admin" \
  --quiet \
  --eval "db.dropDatabase()"

if [[ "$FLUSH_REDIS" -eq 1 ]]; then
  if docker inspect "$REDIS_CONTAINER" >/dev/null 2>&1; then
    echo "Flushing Redis..."
    docker exec "$REDIS_CONTAINER" redis-cli -a "$REDIS_PASSWORD" FLUSHALL >/dev/null
    echo "Redis flushed."
  else
    echo "Redis container not found ($REDIS_CONTAINER); skipped." >&2
  fi
fi

echo
echo "Done. Collections remaining:"
docker exec "$MONGO_CONTAINER" mongosh \
  "mongodb://${MONGO_INITDB_ROOT_USERNAME}:${MONGO_INITDB_ROOT_PASSWORD}@localhost:27017/${DB_NAME}?authSource=admin" \
  --quiet \
  --eval "printjson(db.getCollectionNames())"
