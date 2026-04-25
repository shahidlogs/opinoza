#!/usr/bin/env bash
# Manual one-shot database backup for Opinoza.
# Usage: bash scripts/backup-db.sh
#
# Requires DATABASE_URL to be set in the environment.
# Backups are written to .backups/db/ in the workspace root.
# Credentials are never printed to stdout or logs.
# pg_dump receives the full connection URI — no manual URL parsing needed.

set -euo pipefail

BACKUP_DIR="$(cd "$(dirname "$0")/.." && pwd)/.backups/db"
MAX_BACKUPS=7

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[backup] ERROR: DATABASE_URL is not set." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date -u +"%Y-%m-%d_%H-%M")
FILENAME="opinoza_${TIMESTAMP}.sql.gz"
DEST="${BACKUP_DIR}/${FILENAME}"

if [ -f "$DEST" ]; then
  echo "[backup] File already exists, skipping: ${FILENAME}" >&2
  exit 0
fi

echo "[backup] Starting backup → ${FILENAME}"

# Pass the full URI to pg_dump directly — it handles all connection details.
# PGPASSWORD is not needed when using a URI that includes credentials.
pg_dump \
  --dbname="$DATABASE_URL" \
  --no-password \
  --format=plain \
  --no-owner \
  --no-acl \
  | gzip -9 > "$DEST"

SIZE_KB=$(du -k "$DEST" | cut -f1)
echo "[backup] Backup complete: ${FILENAME} (${SIZE_KB} KB)"

# Prune: keep only the most recent MAX_BACKUPS files
FILE_COUNT=$(ls -1 "${BACKUP_DIR}"/opinoza_*.sql.gz 2>/dev/null | wc -l)
if [ "$FILE_COUNT" -gt "$MAX_BACKUPS" ]; then
  ls -1t "${BACKUP_DIR}"/opinoza_*.sql.gz | tail -n +"$((MAX_BACKUPS + 1))" | while IFS= read -r old; do
    rm -f "$old"
    echo "[backup] Pruned: $(basename "$old")"
  done
fi

echo "[backup] Done. Backups retained: $(ls -1 "${BACKUP_DIR}"/opinoza_*.sql.gz 2>/dev/null | wc -l)/${MAX_BACKUPS}"
