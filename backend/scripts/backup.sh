#!/usr/bin/env sh
set -eu
: "${DATABASE_URL:?DATABASE_URL is required}"
storage_dir=${STORAGE_LOCAL_DIR:-storage}
output_dir=${1:-backups}
stamp=$(date -u +%Y%m%d-%H%M%S)
target="$output_dir/intertext-$stamp"
mkdir -p "$target"
pg_dump --format=custom --file "$target/database.dump" "$DATABASE_URL"
if [ -d "$storage_dir" ]; then tar -czf "$target/storage.tar.gz" -C "$storage_dir" .; fi
sha256sum "$target/database.dump" > "$target/SHA256SUMS"
printf 'Backup created: %s\n' "$target"
