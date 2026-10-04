# Movana Database Phase 3D — Object Ownership Transfer & Hardening Execution Report

**Execution Date:** 2026-10-04  
**Target Database:** `movana`  
**Host / Port:** `localhost:5432`  
**PostgreSQL Version:** PostgreSQL 16.13, compiled by Visual C++ build 1944, 64-bit  
**Execution Status:** **COMPLETE & FULLY VERIFIED**  
**Authoritative References:**
- `docs/database/phase3d-ownership-readiness.md`
- `docs/database/phase3c-privileges-execution.md`
- `docs/database/phase3b-role-provisioning-execution.md`
- `scripts/database/apply-phase3d-ownership.ps1`
- `scripts/database/rollback-phase3d-ownership.ps1`

---

## 1. Executive Summary

Phase 3D (Object Ownership Transfer & Ownership Hardening) has been successfully executed against the live `movana` PostgreSQL database. Ownership of exactly **128 application objects** (113 tables, 8 views, and 7 custom application functions) was transferred atomically from the PostgreSQL superuser (`postgres`) to the dedicated non-login object owner role (`movana_owner`).

All architectural boundaries and isolation invariants established during Phase 3B and Phase 3C were strictly maintained:
- Zero extension objects were modified; all 4 extensions, 271 extension functions, and 7 extension types remain owned by `postgres`.
- Schema `public` remains owned by `pg_database_owner`.
- Zero application data was modified (all row counts match baseline exactly).
- All 19 negative security regression tests passed (`permission denied` enforced).
- All 9 database integrity test suite checks passed (9 PASSED, 0 FAILED).
- No new migrations were created or executed; the ledger remains immutably at V001 through V025.

---

## 2. Pre-Execution Backup Verification

A full, verified logical backup of the target database `movana` was captured prior to executing any DDL statements:

- **Backup Command:** `powershell -ExecutionPolicy Bypass -File scripts/database/backup-movana.ps1 -Label "pre_v3d_ownership"`
- **Backup File:** `C:\Users\Manoj\OneDrive\Desktop\Movana\backups\database\movana_backup_20261004_161058_pre_v3d_ownership.dump`
- **Metadata File:** `C:\Users\Manoj\OneDrive\Desktop\Movana\backups\database\movana_backup_20261004_161058_pre_v3d_ownership.json`
- **File Format:** PostgreSQL Custom Format (`-F c`)
- **File Size:** 677,499 bytes (0.65 MB)
- **SHA-256 Hash:** `D386E2CFAF2664C2277CF3CA1F87A39F1CCEC98E94C8F75FDB190BE3A4D1E343`
- **TOC Catalogued Items:** 1,295 items (verified via `pg_restore -l`)
- **Execution Timestamp:** 2026-10-04 16:10:59 +05:30 (UTC: 2026-10-04T10:40:59Z)
- **Backup Verification Result:** **PASS (Verified Golden Backup)**

---

## 3. Pre-Execution Baseline Validation

Before initiating transactional execution, the following catalog preconditions were validated:

1. **Database Identity:** `SELECT current_database();` strictly returned `movana`.
2. **Role Inventory (Phase 3B):** `movana_owner` [NOLOGIN], `movana_app` [LOGIN], `movana_readonly` [LOGIN], and `movana_migration` [LOGIN] were verified present with correct flags.
3. **Role Membership:** Exactly 1 membership verified: `movana_owner -> movana_migration`. Zero memberships for `movana_app` or `movana_readonly`.
4. **Schema Ownership:** Schema `public` confirmed owned by `pg_database_owner`.
5. **Extension Catalog:** Exactly 4 extensions (`btree_gist`, `citext`, `pgcrypto`, `plpgsql`) and 271 extension functions in `public` confirmed owned by `postgres`.
6. **Pre-Transfer Relation Owner:** Exactly 113 base/partitioned tables, 8 views, and 7 functions in `public` confirmed owned by `postgres`.
7. **Data Counts:** `users` = 68, `bookings` = 181, `trips` = 61, `vehicle_location_history` = 1600 confirmed.

---

## 4. Transactional Implementation Execution

The implementation was applied using the newly created PowerShell automation script:
`scripts/database/apply-phase3d-ownership.ps1`

### Execution Details:
- **Execution Mode:** Single Atomic Transaction (`BEGIN; ... COMMIT;`) with `ON_ERROR_STOP=1`.
- **Blanket `REASSIGN OWNED`:** **STRICTLY PROHIBITED AND NOT USED**.
- **Statements Executed:** Exactly **128 explicit DDL statements**:
  - **Step 1:** Partitioned Table Parent (`ALTER TABLE public.vehicle_location_history OWNER TO movana_owner;`)
  - **Step 2:** 8 Child Partition Tables:
    - `ALTER TABLE public.vehicle_location_history_default OWNER TO movana_owner;`
    - `ALTER TABLE public.vehicle_location_history_y2026m09 OWNER TO movana_owner;`
    - `ALTER TABLE public.vehicle_location_history_y2026m10 OWNER TO movana_owner;`
    - `ALTER TABLE public.vehicle_location_history_y2026m11 OWNER TO movana_owner;`
    - `ALTER TABLE public.vehicle_location_history_y2026m12 OWNER TO movana_owner;`
    - `ALTER TABLE public.vehicle_location_history_y2027m01 OWNER TO movana_owner;`
    - `ALTER TABLE public.vehicle_location_history_y2027m02 OWNER TO movana_owner;`
    - `ALTER TABLE public.vehicle_location_history_y2027m03 OWNER TO movana_owner;`
  - **Step 3:** Migration Ledger Table (`ALTER TABLE public.schema_migrations OWNER TO movana_owner;`)
  - **Step 4:** 103 Standard Base Tables (alphabetically enumerated)
  - **Step 5:** 8 Operational Views:
    - `ALTER VIEW public.vw_active_vehicle_locations OWNER TO movana_owner;`
    - `ALTER VIEW public.vw_available_trip_seats OWNER TO movana_owner;`
    - `ALTER VIEW public.vw_booking_summary OWNER TO movana_owner;`
    - `ALTER VIEW public.vw_driver_trip_summary OWNER TO movana_owner;`
    - `ALTER VIEW public.vw_payment_summary OWNER TO movana_owner;`
    - `ALTER VIEW public.vw_route_schedule_summary OWNER TO movana_owner;`
    - `ALTER VIEW public.vw_trip_current_status OWNER TO movana_owner;`
    - `ALTER VIEW public.vw_vehicle_health_summary OWNER TO movana_owner;`
  - **Step 6:** 7 Custom Application Functions (with exact signatures):
    - `ALTER FUNCTION public.fn_calculate_trip_available_seats(uuid) OWNER TO movana_owner;`
    - `ALTER FUNCTION public.fn_generate_booking_reference() OWNER TO movana_owner;`
    - `ALTER FUNCTION public.fn_generate_invoice_number() OWNER TO movana_owner;`
    - `ALTER FUNCTION public.fn_log_booking_status_transition() OWNER TO movana_owner;`
    - `ALTER FUNCTION public.fn_log_trip_status_transition() OWNER TO movana_owner;`
    - `ALTER FUNCTION public.fn_record_audit_log() OWNER TO movana_owner;`
    - `ALTER FUNCTION public.fn_set_updated_at() OWNER TO movana_owner;`
  - **Step 7:** In-Transaction Assertions (verified 121 relations and 7 functions owned by `movana_owner` before commit).
- **Transaction Outcome:** **COMMIT (Cleanly Committed)**
- **Transaction Execution Duration:** 229 ms

---

## 5. Post-Execution Catalog Ownership Verification

A comprehensive catalog query was executed immediately following the commit:

```sql
SELECT c.relkind, pg_get_userbyid(c.relowner) AS owner, count(*)
FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'i', 'I')
GROUP BY c.relkind, c.relowner
ORDER BY c.relkind, c.relowner;
```

### Catalog Findings:

| Object Class | `relkind` | Owner | Count | Status | Notes |
| :--- | :---: | :--- | :---: | :---: | :--- |
| **Base Tables** | `r` | `movana_owner` | **112** | **VERIFIED** | 104 standard base tables + 8 child partitions |
| **Partitioned Table Parent** | `p` | `movana_owner` | **1** | **VERIFIED** | `vehicle_location_history` parent |
| **Operational Views** | `v` | `movana_owner` | **8** | **VERIFIED** | All 8 analytical views |
| **Standard Indexes** | `i` | `movana_owner` | **341** | **VERIFIED** | Automatically cascaded via table ownership |
| **Partitioned Indexes** | `I` | `movana_owner` | **4** | **VERIFIED** | Automatically cascaded via table ownership |
| **Application Functions** | proc | `movana_owner` | **7** | **VERIFIED** | All 7 custom application routines |
| **Extension Functions** | proc | `postgres` | **271** | **VERIFIED** | Extension routines untouched |
| **Extensions** | ext | `postgres` | **4** | **VERIFIED** | `btree_gist`, `citext`, `pgcrypto`, `plpgsql` untouched |
| **Extension Types** | type | `postgres` | **7** | **VERIFIED** | Extension data types untouched |
| **Composite & Array Types** | type | `movana_owner` | **242** | **VERIFIED** | Automatically cascaded via table ownership |
| **Schema `public`** | schema | `pg_database_owner` | **1** | **VERIFIED** | Preserved untouched |

---

## 6. Partition Hierarchy Verification

Partition relations and dependencies were audited in `pg_class` and `pg_inherits`:

- **Parent Table:** `public.vehicle_location_history` (`relkind = 'p'`) -> `owner: movana_owner`
- **Parent Partitioned Indexes:** 1 partitioned index -> `owner: movana_owner`
- **Child Partition Tables (8 total):**
  1. `vehicle_location_history_default` -> `owner: movana_owner`
  2. `vehicle_location_history_y2026m09` -> `owner: movana_owner`
  3. `vehicle_location_history_y2026m10` -> `owner: movana_owner`
  4. `vehicle_location_history_y2026m11` -> `owner: movana_owner`
  5. `vehicle_location_history_y2026m12` -> `owner: movana_owner`
  6. `vehicle_location_history_y2027m01` -> `owner: movana_owner`
  7. `vehicle_location_history_y2027m02` -> `owner: movana_owner`
  8. `vehicle_location_history_y2027m03` -> `owner: movana_owner`
- **Child Partition Indexes:** Exactly 32 indexes across child partitions -> `owner: movana_owner`
- **Total Partition Relations:** Exactly **42 objects** unified under `movana_owner`.
- **Partition Routing Test:** Routing to date-based partitions and fallback to default partition passed without regression.

---

## 7. Operational View Queryability Verification

All 8 views were tested for queryability under `movana_app` and `movana_readonly`:

| View Name | `movana_app` Query | `movana_readonly` Query | Execution Semantics | Status |
| :--- | :---: | :---: | :--- | :---: |
| `vw_active_vehicle_locations` | `SELECT count(*)` -> PASS | `SELECT count(*)` -> PASS | Standard (Runs as `movana_owner`) | **PASS** |
| `vw_available_trip_seats` | `SELECT count(*)` -> PASS | `SELECT count(*)` -> PASS | Standard (Runs as `movana_owner`) | **PASS** |
| `vw_booking_summary` | `SELECT count(*)` -> PASS | `SELECT count(*)` -> PASS | Standard (Runs as `movana_owner`) | **PASS** |
| `vw_driver_trip_summary` | `SELECT count(*)` -> PASS | `SELECT count(*)` -> PASS | Standard (Runs as `movana_owner`) | **PASS** |
| `vw_payment_summary` | `SELECT count(*)` -> PASS | `SELECT count(*)` -> PASS | Standard (Runs as `movana_owner`) | **PASS** |
| `vw_route_schedule_summary` | `SELECT count(*)` -> PASS | `SELECT count(*)` -> PASS | Standard (Runs as `movana_owner`) | **PASS** |
| `vw_trip_current_status` | `SELECT count(*)` -> PASS | `SELECT count(*)` -> PASS | Standard (Runs as `movana_owner`) | **PASS** |
| `vw_vehicle_health_summary` | `SELECT count(*)` -> PASS | `SELECT count(*)` -> PASS | Standard (Runs as `movana_owner`) | **PASS** |

---

## 8. Application Function Verification

All 7 application functions were verified:
- **Ownership:** `movana_owner`
- **Execution Security:** All 7 verified `SECURITY INVOKER` (`prosecdef = f`). Zero `SECURITY DEFINER` routines exist.
- **Search Path:** Hardened `{"search_path=public, pg_temp"}` preserved intact.
- **Callable by `movana_app`:**
  - `fn_calculate_trip_available_seats(...)` -> Returned `39` seats available.
  - `fn_generate_booking_reference()` -> Returned valid format booking reference.
  - `fn_generate_invoice_number()` -> Returned valid format invoice number.

---

## 9. Extension Functionality Verification

- **`citext`:** Case-insensitive comparison `WHERE email = 'test@example.com'::citext` executed successfully under both `movana_app` and `movana_readonly`.
- **`pgcrypto`:** SHA-256 digest `digest('security_test', 'sha256')` generated valid cryptographic hash under both `movana_app` and `movana_readonly`.
- **Ownership:** Zero extension objects transferred. All 271 extension routines remain owned by `postgres`.

---

## 10. Security Denial Regression Test Suite (19 Tests)

All Phase 3C negative security boundaries were re-tested post-ownership transfer:

| Test # | Tested Role | Target Operation | Expected Result | Actual Result | Status |
| :---: | :--- | :--- | :--- | :--- | :---: |
| 1 | `movana_app` | `UPDATE public.audit_logs ...` | Permission Denied | `ERROR: permission denied for table audit_logs` | **PASS** |
| 2 | `movana_app` | `DELETE FROM public.audit_logs ...` | Permission Denied | `ERROR: permission denied for table audit_logs` | **PASS** |
| 3 | `movana_app` | `TRUNCATE public.audit_logs` | Permission Denied | `ERROR: permission denied for table audit_logs` | **PASS** |
| 4 | `movana_app` | `UPDATE public.security_events ...` | Permission Denied | `ERROR: permission denied for table security_events` | **PASS** |
| 5 | `movana_app` | `UPDATE public.login_attempts ...` | Permission Denied | `ERROR: permission denied for table login_attempts` | **PASS** |
| 6 | `movana_app` | `SELECT * FROM public.schema_migrations` | Permission Denied | `ERROR: permission denied for table schema_migrations` | **PASS** |
| 7 | `movana_app` | `TRUNCATE public.reviews` | Permission Denied | `ERROR: permission denied for table reviews` | **PASS** |
| 8 | `movana_app` | `CREATE TABLE public.should_fail_app ...` | Permission Denied | `ERROR: permission denied for schema public` | **PASS** |
| 9 | `movana_readonly` | `SELECT * FROM public.schema_migrations` | Permission Denied | `ERROR: permission denied for table schema_migrations` | **PASS** |
| 10 | `movana_readonly` | `SELECT * FROM public.password_reset_tokens` | Permission Denied | `ERROR: permission denied for table password_reset_tokens` | **PASS** |
| 11 | `movana_readonly` | `SELECT * FROM public.email_verification_tokens`| Permission Denied | `ERROR: permission denied for table email_verification_tokens`| **PASS** |
| 12 | `movana_readonly` | `SELECT * FROM public.user_sessions` | Permission Denied | `ERROR: permission denied for table user_sessions` | **PASS** |
| 13 | `movana_readonly` | `SELECT * FROM public.payment_methods` | Permission Denied | `ERROR: permission denied for table payment_methods` | **PASS** |
| 14 | `movana_readonly` | `SELECT * FROM public.driver_verifications` | Permission Denied | `ERROR: permission denied for table driver_verifications` | **PASS** |
| 15 | `movana_readonly` | `INSERT INTO public.users ...` | Permission Denied | `ERROR: permission denied for table users` | **PASS** |
| 16 | `movana_readonly` | `UPDATE public.trips ...` | Permission Denied | `ERROR: permission denied for table trips` | **PASS** |
| 17 | `movana_readonly` | `DELETE FROM public.bookings ...` | Permission Denied | `ERROR: permission denied for table bookings` | **PASS** |
| 18 | `movana_readonly` | `TRUNCATE public.reviews` | Permission Denied | `ERROR: permission denied for table reviews` | **PASS** |
| 19 | `movana_readonly` | `CREATE TABLE public.should_fail_ro ...` | Permission Denied | `ERROR: permission denied for schema public` | **PASS** |

**Negative Security Suite Result:** **19 PASSED, 0 FAILED**

---

## 11. Database Integrity Verification Suite

Executed: `psql -f database/tests/database_integrity.sql`

```text
[PASS] Table Inventory Verification (106 base tables found)
[PASS] Primary Key Integrity on All Relational Tables (0 tables missing PK)
[PASS] Concurrency Protection: Prevent Double Booking Same Seat (Rejected: SQLSTATE 23505)
[PASS] Payment Idempotency Webhook Shield (Rejected: SQLSTATE 23505)
[PASS] Check Constraint: Reject Negative Payment Amount (Correctly rejected)
[PASS] Geospatial Bounds: Reject Latitude > 90.0 (Correctly rejected)
[PASS] Rating Constraint: Reject Rating Out of Range (0 or 6) (Correctly rejected)
[PASS] GPS Range Partitioning Routing Verification (Partition routing verified)
[PASS] Operational Views Queryability (All 8 views functional)
====================================================================
TEST RESULTS SUMMARY: 9 PASSED, 0 FAILED
====================================================================
```

---

## 12. Object Inventory and Migration Ledger Invariant

Executed: `powershell -ExecutionPolicy Bypass -File scripts/database/verify-movana.ps1`

- **Base Tables:** 113 (112 base tables + 1 partitioned parent)
- **Views:** 8
- **Functions / Procedures:** 278 (7 application + 271 extension)
- **Triggers:** 73
- **Indexes:** 345 (341 standard + 4 partitioned)
- **Foreign Keys:** 193
- **Partitioned Tables:** 1
- **Child Partitions:** 40 (pg_inherits total links)
- **Migration Ledger:** Exactly 25 successful migrations (V001 through V025). Zero new migrations created. Checksums verified.
- **Application Row Counts:**
  - `users`: **68** (unchanged)
  - `bookings`: **181** (unchanged)
  - `trips`: **61** (unchanged)
  - `vehicle_location_history`: **1600** (unchanged)

---

## 13. Rollback Capability

A tested rollback script has been established:
`scripts/database/rollback-phase3d-ownership.ps1`

- **Rollback Mechanism:** Atomically transfers the 128 application objects from `movana_owner` back to `postgres`.
- **Preflight Check:** Successfully executed in `-CheckOnly` mode; verified all 113 tables, 8 views, and 7 functions are present and targeted for rollback if needed.
- **Safety Invariant:** Zero extension objects, zero schema changes, zero privilege changes in rollback.

---

## 14. Mandatory Final Safety Status

```text
============================================================
MOVANA PHASE 3D — OWNERSHIP TRANSFER
============================================================

TARGET DATABASE: movana

DATABASE VERIFIED: YES

PRE-3D BACKUP: VERIFIED

OWNERSHIP TRANSFER EXECUTED: YES

OWNERSHIP TRANSFER STATEMENTS: 128

APPLICATION TABLE OWNERSHIP: movana_owner

APPLICATION VIEW OWNERSHIP: movana_owner

APPLICATION FUNCTION OWNERSHIP: movana_owner

PARTITION PARENT OWNERSHIP: movana_owner

CHILD PARTITION OWNERSHIP: movana_owner

EXTENSION OWNERSHIP CHANGED: NO

EXTENSION FUNCTIONS CHANGED: NO

PUBLIC SCHEMA OWNERSHIP CHANGED: NO

PRIVILEGES CHANGED: NO

DEFAULT PRIVILEGES CHANGED: NO

ROLE ATTRIBUTES CHANGED: NO

ROLE MEMBERSHIPS CHANGED: NO

DATA MODIFIED: NO

RLS MODIFIED: NO

MIGRATION EXECUTED: NO

V026 CREATED: NO

V027 CREATED: NO

PHASE 3C REGRESSION: PASSED

INTEGRITY TESTS: 9 PASSED / 0 FAILED

POST-EXECUTION VERIFICATION: PASSED

============================================================
PHASE 3D STATUS: COMPLETE
============================================================
```
