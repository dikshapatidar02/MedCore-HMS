#!/usr/bin/env bash
# ==============================================================================
# MedCore HMS — Production Database Automated Backup Script
# Performs pg_dump with gzip compression, SHA-256 verification, and retention policy
# ==============================================================================

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/opt/medcore-hms/backups}"
TIMESTAMP=$(date -u +"%Y%m%d_%H%M%SZ")
RETENTION_DAYS=7

# Load database credentials from environment or default parameters
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_NAME="${POSTGRES_DB:-medcore_prod}"
DB_USER="${POSTGRES_USER:-medcore_admin}"

mkdir -p "${BACKUP_DIR}"

BACKUP_FILE="${BACKUP_DIR}/medcore_backup_${TIMESTAMP}.sql.gz"
CHECKSUM_FILE="${BACKUP_FILE}.sha256"

echo "=========================================================================="
echo "💾 Starting MedCore HMS Database Backup"
echo "   Timestamp: ${TIMESTAMP}"
echo "   Target DB: ${DB_NAME} at ${DB_HOST}:${DB_PORT}"
echo "=========================================================================="

# 1. Execute pg_dump and pipe directly into gzip
PGPASSWORD="${POSTGRES_PASSWORD:-}" pg_dump \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U "${DB_USER}" \
  -F c \
  -b \
  -v \
  "${DB_NAME}" | gzip -9 > "${BACKUP_FILE}"

# 2. Compute SHA-256 Checksum for tamper evidence
sha256sum "${BACKUP_FILE}" > "${CHECKSUM_FILE}"

FILE_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo "✅ Backup successfully created:"
echo "   File: ${BACKUP_FILE} (${FILE_SIZE})"
echo "   Checksum: $(cat "${CHECKSUM_FILE}")"

# 3. Apply retention policy (delete backups older than RETENTION_DAYS)
echo "🧹 Purging backups older than ${RETENTION_DAYS} days..."
find "${BACKUP_DIR}" -name "medcore_backup_*.sql.gz*" -mtime "+${RETENTION_DAYS}" -delete

echo "=========================================================================="
echo "🎉 Backup operation completed successfully."
echo "=========================================================================="
