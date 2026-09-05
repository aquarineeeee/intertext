#!/usr/bin/env sh
set -eu
: "${DATABASE_URL:?DATABASE_URL is required}"
backup_dir=${1:?usage: restore.sh BACKUP_DIR}
storage_dir=${STORAGE_LOCAL_DIR:-storage}
pg_restore --clean --if-exists --no-owner --dbname "$DATABASE_URL" "$backup_dir/database.dump"
if [ -f "$backup_dir/storage.tar.gz" ]; then mkdir -p "$storage_dir"; tar -xzf "$backup_dir/storage.tar.gz" -C "$storage_dir"; fi
printf '%s\n' "Restore completed. Run alembic upgrade head, /health, and pytest before serving traffic."
