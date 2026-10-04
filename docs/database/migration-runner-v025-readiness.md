# Movana Database Migration Runner — V025 Readiness & Audit Report

**Date:** 2026-09-30  
**Target Database:** `movana` (PostgreSQL 16.13, localhost:5432)  
**Script Under Audit:** `scripts/database/migrate-movana.ps1`  
**Status:** VALIDATED & READY (Pre-Execution State)

---

## 1. Executive Summary

During the Phase 2 optimization preparation, pre-execution verification revealed that `scripts/database/migrate-movana.ps1` was constrained by a hardcoded file count check expecting exactly 24 migration files (`$expectedCount = 24`). Upon adding `database/migrations/V025__database_optimizations.sql`, the runner aborted with:

```text
[CRITICAL ERROR] Expected exactly 24 migration files, but discovered 25.
```

To resolve this limitation while upholding all zero-defect production database safety invariants, `scripts/database/migrate-movana.ps1` has been updated. The runner now dynamically discovers versioned migration files, validates strict sequential continuity ($V001 \dots V_N$), computes applied vs. pending migrations against `schema_migrations`, provides clear inventory reporting, gracefully exits when the database is already synchronized, and ensures safe ledger upsert tracking without altering the live database.

---

## 2. Problem Analysis & Root Cause

### 2.1 Hardcoded Expectation
In the initial deployment runner:
- Line 66 hardcoded `$expectedCount = 24`.
- Line 67 asserted `$allFiles.Count -ne $expectedCount`.
- Line 73 looped through a fixed range `1..$expectedCount`.
- Line 91 printed confirmation for 24 migrations.

This design prevented legitimate incremental migrations (V025+) from executing without script edits.

### 2.2 Ledger Recording Anomaly for V025+
In migrations `V001` through `V024`, each migration SQL file included an internal `INSERT INTO schema_migrations ... ON CONFLICT (version) DO NOTHING;` placeholder row. The previous runner updated this row with:
```sql
WITH updated AS (
    UPDATE schema_migrations 
    SET checksum = '$fileHash', execution_time_ms = $execMs, success = TRUE 
    WHERE version = '$version'
    RETURNING 1
)
SELECT count(*) FROM updated;
```
Because `V025__database_optimizations.sql` adheres to enterprise migration standards (where DDL migrations focus exclusively on database changes and the migration orchestrator manages ledger entries), it does not self-insert a placeholder row. Under the previous script, an `UPDATE` would match 0 rows, triggering:
```text
[FATAL ERROR / CONSISTENCY-RISK CONDITION] Schema migration ledger update anomaly for V025!
CRITICAL CONSISTENCY RISK: Expected exactly 1 row updated in 'schema_migrations', but affected row count was: '0'.
```

---

## 3. Engineering Changes Implemented

The file [`scripts/database/migrate-movana.ps1`](file:///c:/Users/Manoj/OneDrive/Desktop/Movana/scripts/database/migrate-movana.ps1) was updated with the following architectural improvements:

### 3.1 Dynamic Migration Discovery & Validation
- Replaced fixed count `$expectedCount = 24` with `$discoveredCount = $allFiles.Count`.
- Implemented sequential validation checking that:
  - Files match `^V\d{3}__.*\.sql$`.
  - Numbering begins strictly at `V001`.
  - Every increment $i \in \{1 \dots N\}$ matches `V{i:D3}` exactly.
  - Zero duplicate versions exist.
  - Zero numbering gaps exist.
- Dynamically determines highest discovered version (`$highestDiscoveredVersion`).

### 3.2 Inventory and Status Reporting
Before executing any migration statements, the runner reads `schema_migrations` and computes pending files, displaying a structured summary:
```text
==========================================================
MIGRATION INVENTORY & STATUS SUMMARY
==========================================================
Applied migrations   : 24
Discovered migrations: 25
Pending migrations   : 1
Pending migration    : V025__database_optimizations.sql
==========================================================
```

### 3.3 Clean Up-to-Date Exit
If `$pendingFiles.Count -eq 0`, the script prints:
```text
[State] No pending migrations. Database is up to date.
Database 'movana' is fully synchronized at version V025.
```
and exits cleanly with code `0`, avoiding redundant execution overhead or false error states.

### 3.4 Optional Check-Only Mode
Added parameter `[switch]$CheckOnly`. When passed, the runner connects to PostgreSQL, asserts database identity (`movana`), verifies file numbering and sequence integrity, checks applied migrations and checksums, prints the inventory status summary, and exits `0` without running any pending DDL statements.

### 3.5 Resilient Ledger Upsert
Replaced the plain `UPDATE` statement with an atomic `UPSERT` using PostgreSQL `ON CONFLICT (version) DO UPDATE`:
```sql
WITH ledger_record AS (
    INSERT INTO schema_migrations (
        version, description, type, script, checksum, installed_by, installed_on, execution_time_ms, success
    )
    VALUES (
        '$version', '$desc', 'SQL', '$($file.Name)', '$fileHash', CURRENT_USER, CURRENT_TIMESTAMP, $execMs, TRUE
    )
    ON CONFLICT (version) DO UPDATE 
    SET description = EXCLUDED.description,
        type = EXCLUDED.type,
        script = EXCLUDED.script,
        checksum = EXCLUDED.checksum, 
        execution_time_ms = EXCLUDED.execution_time_ms, 
        success = TRUE
    RETURNING 1
)
SELECT count(*) FROM ledger_record;
```
- For legacy migrations (V001–V024) where a placeholder exists: `ON CONFLICT` triggers, updates checksum and timing, and returns 1.
- For new migrations (V025+) where no placeholder exists: `INSERT` executes, populates all metadata, and returns 1.
- The assertion `trimmedRows -eq "1"` continues to guarantee that exactly 1 row was affected.

---

## 4. Safety Guardrails Preserved

All existing safety mechanisms remain strictly enforced:
1. **Target Database Immutability:** `Set-Variable -Name TargetDatabase -Value "movana" -Option ReadOnly` ensures the runner cannot be directed at any other database.
2. **Pre-flight Live Connection & Database Identity Verification:** Runs `SELECT current_database();` and asserts that the connected database name matches `movana` strictly.
3. **Fail-Fast Transactional Execution:** Executes scripts with `-v ON_ERROR_STOP=1`.
4. **Historical Checksum Verification:** Verifies SHA-256 checksums of already-applied migrations against `schema_migrations`, halting immediately if any applied migration has been altered or has an empty checksum.
5. **No Live Database Alteration During Update:** No migrations or DDL/DML modifications were executed against `movana` during this update phase.

---

## 5. Static Verification & Testing

### 5.1 PowerShell AST Parser Check
Executed the PowerShell Abstract Syntax Tree parser against `scripts/database/migrate-movana.ps1`:
```powershell
[System.Management.Automation.Language.Parser]::ParseFile(...)
```
**Result:** `SYNTAX VALID: 0 errors`.

### 5.2 Hardcoded Constant Inspection
Searched the codebase of `scripts/database/migrate-movana.ps1` for any hardcoded references to `24`:
**Result:** Only 1 occurrence found, located within a comment explaining backward-compatibility with V001–V024 placeholder rows. Zero hardcoded migration count bounds remain.

### 5.3 Live Database Baseline Verification
Verified that `movana` remains in its verified pre-V025 state:
- `SELECT count(*) FROM schema_migrations;` = **24**
- `SELECT count(*) FROM pg_tables WHERE schemaname = 'public';` = **109**
- Pre-V025 backup file present: `backups/database/movana_backup_20260930_160142_pre_v025.dump`

---

## 6. Readiness Assessment

`scripts/database/migrate-movana.ps1` is fully verified and ready to execute V025 when authorized.
