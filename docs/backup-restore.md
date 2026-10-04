# Movana Database Backup, Restore & Disaster Recovery Runbook

This document defines standard operating procedures for taking reliable backups, performing Point-in-Time Recovery (PITR), and safely restoring data to the **`movana`** database without affecting neighboring databases.

> [!NOTE]
> For the comprehensive, deep-dive technical backup and disaster recovery guide, refer to:
> [`docs/database/backup-restore.md`](database/backup-restore.md).

---

## 1. Safety Directive: Neighboring Database Isolation

The local PostgreSQL instance hosts multiple independent databases (`localhero_db`, `chatbot_db`, `cyber_investigation`, `dayflow`, `maritime_m3_db`, `skillbridge_ai`, `movana_db`).

**Rules**:
1. Never run instance-wide `pg_dumpall` that restores and overwrites neighboring databases.
2. Every `pg_dump` and `pg_restore` command must explicitly target `-d movana`.
3. Never drop or rename databases other than `movana`.

---

## 2. Automated Backup Procedure (Recommended)

To create a verified, compressed logical backup with full integrity checks and sidecar metadata:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/database/backup-movana.ps1
```

* Flags supported:
  * `-HostName <string>`: Database host (default: `localhost`)
  * `-Port <int>`: Database port (default: `5432`)
  * `-User <string>`: Administrative user (default: `postgres`)
  * `-Label <string>`: Descriptive tag for the backup (e.g. `golden_baseline`)

---

## 3. Manual Logical Database Backup (`pg_dump`)

If running manually via PostgreSQL client tools:

```powershell
# Create backups directory if missing
New-Item -ItemType Directory -Force -Path "backups/database"

# Generate timestamped backup using custom format (-F c)
$TIMESTAMP = (Get-Date).ToString("yyyyMMdd_HHmmss")
pg_dump -U postgres -h localhost -p 5432 -d movana -F c -b -v -f "backups/database/movana_backup_$TIMESTAMP.dump"

# Calculate SHA-256 hash for integrity tracking
Get-FileHash -Path "backups/database/movana_backup_$TIMESTAMP.dump" -Algorithm SHA256

# Verify Table of Contents (TOC)
pg_restore -l "backups/database/movana_backup_$TIMESTAMP.dump"
```

* Flags:
  * `-F c`: Custom compressed PostgreSQL archive format (supports selective restore and multi-threaded processing).
  * `-b`: Include large objects / blobs.
  * `-v`: Verbose progress logging.

---

## 4. Restore Procedures & Safety Warnings

> [!WARNING]
> **Avoid `--clean` in Active Databases**:
> Blindly running `pg_restore --clean` is dangerous because it emits `DROP` statements that can fail on foreign key dependencies or trigger cascades. Always restore to a temporary scratch database (`movana_restore_test`) to validate the backup first, or perform a clean drop/recreate of the database before restoring.

### 4.1 Safe Restore Pattern (Scratch Database Validation)

```powershell
# 1. Create a temporary scratch database
psql -U postgres -h localhost -p 5432 -d postgres -c "CREATE DATABASE movana_restore_test;"

# 2. Restore custom archive into scratch database
pg_restore -U postgres -h localhost -p 5432 -d movana_restore_test --no-owner --no-privileges -v "backups/database/movana_backup_YYYYMMDD_HHMMSS.dump"

# 3. Validate scratch database data integrity, then drop when done
psql -U postgres -h localhost -p 5432 -d postgres -c "DROP DATABASE movana_restore_test;"
```

### 4.2 Clean Rebuild of Live Database (Disaster Recovery)

```powershell
# 1. Terminate client connections and recreate empty movana database
psql -U postgres -h localhost -p 5432 -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'movana' AND pid <> pg_backend_pid();"
psql -U postgres -h localhost -p 5432 -d postgres -c "DROP DATABASE movana;"
psql -U postgres -h localhost -p 5432 -d postgres -c "CREATE DATABASE movana WITH OWNER postgres ENCODING 'UTF8';"

# 2. Restore archive
pg_restore -U postgres -h localhost -p 5432 -d movana --single-transaction --no-owner -v "backups/database/movana_backup_YYYYMMDD_HHMMSS.dump"
```

---

## 5. Production Point-in-Time Recovery (PITR) Strategy

For production operations:
1. **Continuous WAL Archiving**:
   * PostgreSQL WAL (Write-Ahead Logging) is archived continuously to encrypted cloud object storage (e.g., S3 Glacier / GCS).
2. **Weekly Physical Base Backups**:
   * Executed via `pg_basebackup` with zero locking impact on read/write workloads.
3. **Recovery Target**:
   * Allows restoring the database to any specific second before an erroneous data modification or incident:
     ```text
     recovery_target_time = '2026-09-26 14:30:00 UTC'
     ```
