# MedCore HMS — Disaster Recovery & Backup Runbook

## 1. Overview and Objectives

MedCore HMS is a mission-critical multi-tenant Hospital Management System SaaS. Patient care continuity, diagnostic integrity, and clinical record compliance demand rigorous disaster recovery (DR) protocols.

* **Recovery Point Objective (RPO):** <= 5 minutes (Maximum permissible data loss in disaster scenario).
* **Recovery Time Objective (RTO):** <= 30 minutes (Maximum permissible downtime before full service restoration).

---

## 2. Backup Architecture

### A. AWS RDS Automated Backups & PITR (Production)
1. **Continuous WAL Archiving:** Amazon RDS PostgreSQL archives Write-Ahead Logs (WAL) continuously to S3.
2. **Automated Daily Snapshots:** Captured daily during the designated maintenance window (03:00–04:00 UTC).
3. **Point-In-Time Recovery (PITR):** Enables rolling back database state to any specific second within the 35-day retention window.
4. **Cross-Region Read Replica:** In multi-region deployments, an asynchronous read replica in a secondary AWS region (`us-west-2`) is maintained to provide instant disaster failover.

### B. Independent Logical Dumps (`scripts/backup-db.sh`)
1. Scheduled cron execution runs every 6 hours on the primary host.
2. Custom format (`-F c`) pg_dump with maximum gzip compression (`-9`).
3. SHA-256 tamper-evident integrity checksums generated and stored alongside dumps.
4. Backups are synced to an isolated, immutable AWS S3 bucket with Object Lock (WORM compliance) and a 30-day lifecycle rule.

---

## 3. Database Restoration Procedures

### Scenario 1: Point-In-Time Recovery via AWS CLI (Fastest RTO)
To restore the RDS instance to a state immediately preceding data corruption or human error:

```bash
# Restore to point in time (e.g., 2026-11-05T00:00:00Z)
aws rds restore-db-instance-to-point-in-time \
    --source-db-instance-identifier medcore-prod-db \
    --target-db-instance medcore-prod-db-recovered \
    --restore-time 2026-11-05T00:00:00Z \
    --db-instance-class db.m6g.xlarge \
    --publicly-accessible false \
    --auto-minor-version-upgrade false

# Update backend connection string in AWS Secrets Manager or .env.production
DATABASE_URL="postgresql://medcore_admin:<PASSWORD>@medcore-prod-db-recovered.xxxx.rds.amazonaws.com:5432/medcore_prod?schema=public&sslmode=require"
```

### Scenario 2: Logical Dump Restoration (`pg_restore`)
To restore from an encrypted local or S3 logical backup:

```bash
# 1. Verify SHA-256 Checksum
sha256sum -c medcore_backup_20261105_000000Z.sql.gz.sha256

# 2. Decompress and restore into target database
gunzip -c medcore_backup_20261105_000000Z.sql.gz | pg_restore \
    -h <DB_HOST> \
    -p 5432 \
    -U medcore_admin \
    -d medcore_prod \
    --clean \
    --if-exists \
    --no-owner \
    --no-privileges \
    -v

# 3. Re-run Prisma migration deploy to ensure schema alignment
pnpm --filter @medcore/backend run prisma:migrate:prod
```

---

## 4. Disaster Recovery Drill & Testing Schedule

* **Quarterly DR Drill:** Non-production environment restore drill simulating total RDS instance failure.
* **Monthly Integrity Check:** Automated validation script decrypts and inspects random backup files.
* **Audit Trail Verification:** Verification of `AuditLog` table records post-restoration.
