#!/bin/sh
set -eu

export STORAGE_DIR="${STORAGE_DIR:-/app/storage}"

mkdir -p "$STORAGE_DIR/media" "$STORAGE_DIR/builds" "$STORAGE_DIR/tmp"

if [ "${RUN_DB_MIGRATIONS:-true}" != "false" ]; then
  attempts="${MIGRATION_MAX_ATTEMPTS:-20}"
  attempt=1
  until npm run prisma:migrate:deploy; do
    if [ "$attempt" -ge "$attempts" ]; then
      echo "Database migrations failed after $attempt attempts." >&2
      exit 1
    fi
    echo "Database is not ready yet; retrying migration in 3 seconds ($attempt/$attempts)." >&2
    attempt=$((attempt + 1))
    sleep 3
  done
fi

if [ "${BOOTSTRAP_ADMIN:-true}" != "false" ]; then
  npm run admin:bootstrap
fi

exec "$@"
