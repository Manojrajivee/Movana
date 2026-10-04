# Movana Database Phase 3D — Object Ownership Transfer & Hardening Readiness Audit Report

**Date:** 2026-10-01  
**Target Database:** `movana` (PostgreSQL 16.13, localhost:5432)  
**Audit Status:** STRICTLY READ-ONLY PRE-IMPLEMENTATION SAFETY AUDIT  
**Live Database Modifications:** NONE (Zero ownership, privilege, schema, or data changes; live state 100% untouched)  
**Authoritative References:**
- `docs/database/phase3-roles-permissions-design.md`
- `docs/database/phase3-privilege-matrix.csv`
- `docs/database/phase3b-role-provisioning-execution.md`
- `docs/database/phase3c-privileges-execution.md`

---

## 1. Executive Summary

Following the completion of Phase 3B (Role Provisioning) and Phase 3C (Privileges & Default ACL Hardening), this Phase 3D readiness audit assesses the complete database object ownership landscape of `movana`. The objective of Phase 3D is to transfer ownership of all Movana application objects from the PostgreSQL superuser (`postgres`) to the dedicated non-login schema owner (`movana_owner`), thereby completing the least-privilege administrative boundary.

All catalog inspections were performed in strictly read-only mode. Live database catalog verification confirms that:
- Currently, **100% of tables (113), views (8), indexes (345), and custom functions (7)** in schema `public` are owned by `postgres`.
- Schema `public` is owned by `pg_database_owner` (PostgreSQL 15+ standard pseudo-role).
- Exactly 4 extensions (`btree_gist`, `citext`, `pgcrypto`, `plpgsql`) and their 386 dependent objects (including 271 extension functions in `public` and 7 extension types) are owned by `postgres`.
- Exactly 0 user-defined sequences, 0 enum types, 0 domain types, and 0 materialized views exist.
- Index, constraint, trigger, and composite row-type ownership are structurally tied to their parent tables and automatically cascade upon table ownership reassignment.
- Partitioned table `vehicle_location_history` requires explicit transfer of both the partitioned parent and all 8 child partition tables.
- Blanket `REASSIGN OWNED BY postgres TO movana_owner;` is **STRICTLY FORBIDDEN**, as it would inadvertently attempt to transfer extension internals and system objects.
- A simulated transactional dry run of all 128 explicit `ALTER ... OWNER TO movana_owner;` statements completed with zero errors and rolled back cleanly.

Readiness Decision: **`PHASE 3D READINESS: APPROVED WITH CONDITIONS`**  
*(Subject to: mandatory pre-execution verified backup, explicit object-by-object DDL execution, strict exclusion of all extension objects, parent-then-child partition ordering, and preservation of `pg_database_owner` for schema `public`).*

---

## 2. Current Role Baseline Verification

Live query against `pg_roles` and `pg_auth_members`:

```sql
SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolinherit, rolreplication, rolbypassrls 
FROM pg_roles 
WHERE rolname IN ('movana_owner', 'movana_app', 'movana_readonly', 'movana_migration');
```

| Role Name | Login | Superuser | CreateDB | CreateRole | Inherit | Replication | BypassRLS | Baseline State |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **`movana_owner`** | `f` | `f` | `f` | `f` | `f` | `f` | `f` | **VERIFIED (Target Dedicated Owner)** |
| **`movana_app`** | `t` | `f` | `f` | `f` | `t` | `f` | `f` | **VERIFIED (Runtime Backend)** |
| **`movana_readonly`** | `t` | `f` | `f` | `f` | `t` | `f` | `f` | **VERIFIED (Reporting / Analytics)** |
| **`movana_migration`**| `t` | `f` | `f` | `f` | `t` | `f` | `f` | **VERIFIED (Deployer / Runner)** |

### Role Membership Status
- **Active Membership:** Exactly 1: `movana_owner -> movana_migration` (`admin_option: false`, `inherit_option: true`).
- **Application Isolation:** `movana_app` and `movana_readonly` have **zero** memberships in `movana_owner` or each other.

---

## 3. Complete Ownership Inventory by Object Type

Catalog query across `pg_class`, `pg_proc`, `pg_namespace`, and `pg_extension`:

```sql
SELECT c.relkind, pg_get_userbyid(c.relowner) AS owner, count(*) 
FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid 
WHERE n.nspname = 'public' GROUP BY c.relkind, c.relowner;
```

| Object Classification | Object Count | Current Owner | Target Owner (Phase 3D) | Transfer Method |
| :--- | :---: | :--- | :--- | :--- |
| **Base Tables (`relkind = 'r'`)** | 112 | `postgres` | `movana_owner` | Explicit `ALTER TABLE ... OWNER TO` |
| **Partitioned Table Parent (`relkind = 'p'`)** | 1 | `postgres` | `movana_owner` | Explicit `ALTER TABLE ... OWNER TO` |
| **Operational Views (`relkind = 'v'`)** | 8 | `postgres` | `movana_owner` | Explicit `ALTER VIEW ... OWNER TO` |
| **Custom Application Functions** | 7 | `postgres` | `movana_owner` | Explicit `ALTER FUNCTION ... OWNER TO` |
| **Standard Indexes (`relkind = 'i'`)** | 341 | `postgres` | `movana_owner` | Automatic (Cascades via table ownership) |
| **Partitioned Indexes (`relkind = 'I'`)** | 4 | `postgres` | `movana_owner` | Automatic (Cascades via parent table) |
| **Table Composite & Array Types** | 242 | `postgres` | `movana_owner` | Automatic (Cascades via table ownership) |
| **Table Constraints & Foreign Keys** | 193 | N/A (Table-bound) | N/A (Table-bound) | Automatic (Tied to table relation) |
| **Table Triggers** | 73 | N/A (Table-bound) | N/A (Table-bound) | Automatic (Tied to table relation) |
| **Extension Functions** | 271 | `postgres` | **`postgres`** | **KEEP CURRENT OWNER (Untouched)** |
| **Extension Types** | 7 | `postgres` | **`postgres`** | **KEEP CURRENT OWNER (Untouched)** |
| **Extensions** | 4 | `postgres` | **`postgres`** | **KEEP CURRENT OWNER (Untouched)** |
| **Schema `public`** | 1 | `pg_database_owner`| **`pg_database_owner`** | **KEEP CURRENT OWNER (Untouched)** |
| **System Schemas (`pg_catalog`, etc.)**| 3 | `postgres` | **`postgres`** | **KEEP CURRENT OWNER (Untouched)** |
| **Database `movana`** | 1 | `postgres` | **`postgres`** | **KEEP CURRENT OWNER (Untouched)** |
| **Materialized Views** | 0 | N/A | N/A | None exist |
| **Sequences** | 0 | N/A | N/A | None exist |

---

## 4. Extension Ownership Analysis & Preservation

A catalog audit of `pg_extension` and `pg_depend` reveals that the following extensions and their dependent objects reside in `movana`:

```sql
SELECT e.extname, pg_get_userbyid(e.extowner) AS owner, count(p.oid) AS procs
FROM pg_extension e JOIN pg_depend d ON d.refobjid = e.oid AND d.deptype = 'e'
JOIN pg_proc p ON d.objid = p.oid GROUP BY e.extname, e.extowner;
```

| Extension Name | Installed Schema | Owner | Dependent Functions | Dependent Types | Total Dependent Objects |
| :--- | :--- | :--- | :---: | :---: | :---: |
| **`btree_gist`** | `public` | `postgres` | 188 | 6 (`gbtreekey*`) | 258 |
| **`citext`** | `public` | `postgres` | 47 | 1 (`citext`) | 88 |
| **`pgcrypto`** | `public` | `postgres` | 36 | 0 | 36 |
| **`plpgsql`** | `pg_catalog` | `postgres` | 3 | 0 | 4 |
| **TOTAL** | — | — | **274** (271 in public) | **7** | **386** |

### Why Blanket `REASSIGN OWNED` is Strictly Forbidden
Executing `REASSIGN OWNED BY postgres TO movana_owner;` would attempt to reassign the ownership of all 386 extension-managed objects, C-language operator classes, casts, and procedural language handlers from `postgres` to `movana_owner`. This creates two critical failure modes:
1. Non-superusers cannot own C-language extension functions or system operators in PostgreSQL.
2. Future `ALTER EXTENSION ... UPDATE` or `DROP EXTENSION` operations fail or corrupt the catalog when objects are disassociated from extension superuser ownership.

**Mandate:** Phase 3D must transfer **only explicitly enumerated Movana application objects**. Zero extension objects will be modified.

---

## 5. Schema `public` Ownership Analysis

```sql
SELECT nspname, pg_get_userbyid(nspowner) AS owner, nspacl FROM pg_namespace WHERE nspname = 'public';
```
- **Current Owner:** `pg_database_owner`
- **Current ACL:**
  `{pg_database_owner=UC/pg_database_owner,=U/pg_database_owner,movana_owner=UC/pg_database_owner,movana_migration=UC/pg_database_owner,movana_app=U/pg_database_owner,movana_readonly=U/pg_database_owner}`

### Architectural Evaluation: Transfer vs. Retain `pg_database_owner`
1. **PostgreSQL 15/16 Convention:** PostgreSQL 15 introduced `pg_database_owner` as the default owner of `public` to decouple schema ownership from fixed role names and ensure safe template database cloning.
2. **Extension Namespace Compatibility:** Extensions `citext`, `btree_gist`, and `pgcrypto` reside in schema `public`. Maintaining `pg_database_owner` avoids namespace-ownership conflicts between superuser extension objects and non-superuser application objects.
3. **Privilege Sufficiency:** In Phase 3C, `movana_owner` was granted explicit `USAGE, CREATE` on schema `public`. This provides full authority to create, alter, and manage application objects without requiring ownership of the namespace itself.
4. **Security Hardening:** Retaining `pg_database_owner` prevents accidental `DROP SCHEMA public` or schema comment alterations by non-superusers.

**Recommendation:** **RETAIN `pg_database_owner` as the owner of schema `public`.** Do not execute `ALTER SCHEMA public OWNER TO movana_owner;`.

---

## 6. Table Ownership Analysis (113 Tables)

All 113 tables are currently owned by `postgres`. Phase 3D will explicitly transfer ownership of all 113 tables to `movana_owner`:
- 78 Category A Operational tables
- 5 Category B Sensitive Auth/Token tables
- 3 Category C Audit & Security Logging tables
- 26 Category D Reference & Catalog tables
- 1 Category F Migration Ledger table (`schema_migrations`)

All 113 tables will be updated using explicit `ALTER TABLE public.<table_name> OWNER TO movana_owner;`.

---

## 7. Partition Hierarchy Ownership Analysis

The table `vehicle_location_history` is a range-partitioned table with 8 active child partitions:
- Parent: `vehicle_location_history` (`relkind = 'p'`)
- Partitions:
  1. `vehicle_location_history_default`
  2. `vehicle_location_history_y2026m09`
  3. `vehicle_location_history_y2026m10`
  4. `vehicle_location_history_y2026m11`
  5. `vehicle_location_history_y2026m12`
  6. `vehicle_location_history_y2027m01`
  7. `vehicle_location_history_y2027m02`
  8. `vehicle_location_history_y2027m03`

### Partition Transfer Behavior in PostgreSQL
Testing in PostgreSQL 16 confirms that transferring ownership of the parent table (`ALTER TABLE public.vehicle_location_history OWNER TO movana_owner;`) **does NOT automatically transfer the child partitions**. The child partitions remain owned by `postgres` unless each child is also explicitly altered.

### Safe Implementation Order
1. **Step 1:** Transfer parent table:
   ```sql
   ALTER TABLE public.vehicle_location_history OWNER TO movana_owner;
   ```
2. **Step 2:** Transfer all 8 child partition tables individually:
   ```sql
   ALTER TABLE public.vehicle_location_history_default OWNER TO movana_owner;
   ALTER TABLE public.vehicle_location_history_y2026m09 OWNER TO movana_owner;
   ALTER TABLE public.vehicle_location_history_y2026m10 OWNER TO movana_owner;
   ALTER TABLE public.vehicle_location_history_y2026m11 OWNER TO movana_owner;
   ALTER TABLE public.vehicle_location_history_y2026m12 OWNER TO movana_owner;
   ALTER TABLE public.vehicle_location_history_y2027m01 OWNER TO movana_owner;
   ALTER TABLE public.vehicle_location_history_y2027m02 OWNER TO movana_owner;
   ALTER TABLE public.vehicle_location_history_y2027m03 OWNER TO movana_owner;
   ```
*Result:* All 42 objects (parent, 8 partitions, 1 parent partitioned index, 32 child indexes) are unified cleanly under `movana_owner`.

---

## 8. View Ownership Analysis (8 Views)

```sql
SELECT c.relname, pg_get_userbyid(c.relowner) AS owner, c.reloptions FROM pg_class c WHERE c.relkind = 'v';
```

All 8 views (`vw_active_vehicle_locations`, `vw_available_trip_seats`, `vw_booking_summary`, `vw_driver_trip_summary`, `vw_payment_summary`, `vw_route_schedule_summary`, `vw_trip_current_status`, `vw_vehicle_health_summary`) are currently owned by `postgres` with `reloptions = NULL` (standard execution semantics).

### Security & Privilege Impact
- Under standard PostgreSQL view execution, views execute with the privileges of the view owner.
- Once owned by `movana_owner`, views execute under `movana_owner`, which owns 100% of the underlying referenced tables.
- In Phase 3C, `movana_app` and `movana_readonly` were granted explicit `SELECT` on all 8 views.
- Dry-run testing confirmed that `movana_readonly` queries all views without permission errors when the views are owned by `movana_owner`.
- Transfer method: Explicit `ALTER VIEW public.<view_name> OWNER TO movana_owner;`.

---

## 9. Application Function Ownership Analysis (7 Functions)

The 7 custom routines in `public`:
1. `fn_calculate_trip_available_seats(uuid)`
2. `fn_generate_booking_reference()`
3. `fn_generate_invoice_number()`
4. `fn_log_booking_status_transition()`
5. `fn_log_trip_status_transition()`
6. `fn_record_audit_log()`
7. `fn_set_updated_at()`

### Function Security Properties
- **Security Type:** All 7 are verified `SECURITY INVOKER` (`prosecdef = f`). Exactly **0** `SECURITY DEFINER` functions exist.
- **Search Path:** All 7 are configured with hardened search path `{"search_path=public, pg_temp"}`.
- **Language:** All 7 are `plpgsql`.
- **Target Owner:** `movana_owner`.
- Transfer method: Explicit `ALTER FUNCTION public.<exact_signature> OWNER TO movana_owner;`.

---

## 10. Type, Sequence, Index, and Constraint Analysis

1. **User-Defined Types:** Verified **0 standalone enum, domain, or range types** exist. The 242 composite and array types corresponding to tables automatically follow table ownership. The 7 extension types (`citext`, `gbtreekey*`) remain owned by `postgres`.
2. **Sequences:** Verified **0 sequences** exist in `pg_sequences`. No sequence ownership transfer is required.
3. **Indexes (345 total):** PostgreSQL automatically updates index ownership to match the table owner upon `ALTER TABLE ... OWNER TO`. Zero independent `ALTER INDEX` statements are required.
4. **Foreign Keys & Constraints (193 total):** Constraints have no independent owner in `pg_constraint`; authorization derives from the table owner.
5. **Triggers (73 total):** Triggers have no independent owner in `pg_trigger`; execution is tied to the table.

---

## 11. Compatibility & Regression Impact

### Phase 3C Privilege Compatibility
Ownership transfer in PostgreSQL changes the relation owner, but **preserves existing explicit ACLs (`relacl`)**.
- `movana_app` retains its `SELECT, INSERT, UPDATE, DELETE` permissions on Category A tables and `SELECT, INSERT` append-only on Category C audit tables.
- `movana_readonly` remains strictly excluded from Category B token tables and `schema_migrations`.
- View `SELECT` grants for `movana_app` and `movana_readonly` remain active.

### Default ACL Compatibility
In Phase 3C, default privileges were configured specifically for `movana_owner`:
```sql
ALTER DEFAULT PRIVILEGES FOR ROLE movana_owner IN SCHEMA public ...
```
Because Phase 3D establishes `movana_owner` as the owner of the application schema, any future tables or objects created by `movana_owner` (or by `movana_migration` using `SET ROLE movana_owner;`) will automatically inherit the pre-configured default privileges.

### Migration Runner Compatibility (`migrate-movana.ps1`)
- `movana_migration` inherits `movana_owner` (`INHERIT TRUE`).
- When migrations execute DDL under `SET ROLE movana_owner;`, all newly created objects are immediately owned by `movana_owner`.
- Because `movana_owner` will own all existing tables, `movana_migration` can alter existing tables (`ALTER TABLE`, `ADD COLUMN`, `CREATE INDEX`) without requiring `postgres` superuser privileges.

### Backend Compatibility (`movana_app`)
- The backend application connects as `movana_app`.
- Application backend operations require only table-level DML (`SELECT, INSERT, UPDATE, DELETE`), which was granted in Phase 3C.
- The backend never requires object ownership to perform CRUD.

---

## 12. Complete Ownership Transfer Matrix (128 Objects)

| Object Name | Object Type | Current Owner | Target Owner | Action Required |
| :--- | :--- | :--- | :--- | :--- |
| `vehicle_location_history` | Partitioned Table Parent | `postgres` | `movana_owner` | `ALTER TABLE public.vehicle_location_history OWNER TO movana_owner;` |
| `vehicle_location_history_default` | Partition Child Table | `postgres` | `movana_owner` | `ALTER TABLE public.vehicle_location_history_default OWNER TO movana_owner;` |
| `vehicle_location_history_y2026m09` | Partition Child Table | `postgres` | `movana_owner` | `ALTER TABLE public.vehicle_location_history_y2026m09 OWNER TO movana_owner;` |
| `vehicle_location_history_y2026m10` | Partition Child Table | `postgres` | `movana_owner` | `ALTER TABLE public.vehicle_location_history_y2026m10 OWNER TO movana_owner;` |
| `vehicle_location_history_y2026m11` | Partition Child Table | `postgres` | `movana_owner` | `ALTER TABLE public.vehicle_location_history_y2026m11 OWNER TO movana_owner;` |
| `vehicle_location_history_y2026m12` | Partition Child Table | `postgres` | `movana_owner` | `ALTER TABLE public.vehicle_location_history_y2026m12 OWNER TO movana_owner;` |
| `vehicle_location_history_y2027m01` | Partition Child Table | `postgres` | `movana_owner` | `ALTER TABLE public.vehicle_location_history_y2027m01 OWNER TO movana_owner;` |
| `vehicle_location_history_y2027m02` | Partition Child Table | `postgres` | `movana_owner` | `ALTER TABLE public.vehicle_location_history_y2027m02 OWNER TO movana_owner;` |
| `vehicle_location_history_y2027m03` | Partition Child Table | `postgres` | `movana_owner` | `ALTER TABLE public.vehicle_location_history_y2027m03 OWNER TO movana_owner;` |
| `schema_migrations` | Migration Ledger Table | `postgres` | `movana_owner` | `ALTER TABLE public.schema_migrations OWNER TO movana_owner;` |
| *103 Standard Base Tables* (audit_logs, bookings, users, etc.) | Base Tables | `postgres` | `movana_owner` | `ALTER TABLE public.<name> OWNER TO movana_owner;` (103 statements) |
| *8 Views* (vw_booking_summary, etc.) | Views | `postgres` | `movana_owner` | `ALTER VIEW public.<name> OWNER TO movana_owner;` (8 statements) |
| *7 Custom Application Functions* | Functions | `postgres` | `movana_owner` | `ALTER FUNCTION public.<sig> OWNER TO movana_owner;` (7 statements) |
| *271 Extension Functions* | Extension Routines | `postgres` | **`postgres`** | **KEEP CURRENT OWNER (Zero action)** |
| *7 Extension Types* | Extension Types | `postgres` | **`postgres`** | **KEEP CURRENT OWNER (Zero action)** |
| *4 Extensions* | Extensions | `postgres` | **`postgres`** | **KEEP CURRENT OWNER (Zero action)** |
| `public` | Schema | `pg_database_owner`| **`pg_database_owner`**| **KEEP CURRENT OWNER (Zero action)** |

*Summary:* Exactly **128 DDL statements** will be executed in Phase 3D (113 tables + 8 views + 7 functions).

---

## 13. Exact Proposed Implementation Sequence

Phase 3D implementation must be delivered via an atomic PowerShell script `scripts/database/apply-phase3d-ownership.ps1` with `ON_ERROR_STOP=1`:

```sql
\set ON_ERROR_STOP on
BEGIN;

-- STEP 1: Partitioned Table Parent
ALTER TABLE public.vehicle_location_history OWNER TO movana_owner;

-- STEP 2: Partition Child Tables
ALTER TABLE public.vehicle_location_history_default OWNER TO movana_owner;
ALTER TABLE public.vehicle_location_history_y2026m09 OWNER TO movana_owner;
ALTER TABLE public.vehicle_location_history_y2026m10 OWNER TO movana_owner;
ALTER TABLE public.vehicle_location_history_y2026m11 OWNER TO movana_owner;
ALTER TABLE public.vehicle_location_history_y2026m12 OWNER TO movana_owner;
ALTER TABLE public.vehicle_location_history_y2027m01 OWNER TO movana_owner;
ALTER TABLE public.vehicle_location_history_y2027m02 OWNER TO movana_owner;
ALTER TABLE public.vehicle_location_history_y2027m03 OWNER TO movana_owner;

-- STEP 3: Migration Ledger Table
ALTER TABLE public.schema_migrations OWNER TO movana_owner;

-- STEP 4: 103 Standard Base Tables
ALTER TABLE public.audit_logs OWNER TO movana_owner;
ALTER TABLE public.booking_cancellations OWNER TO movana_owner;
-- ... [all 103 base tables enumerated explicitly] ...
ALTER TABLE public.vehicles OWNER TO movana_owner;

-- STEP 5: 8 Operational Views
ALTER VIEW public.vw_active_vehicle_locations OWNER TO movana_owner;
ALTER VIEW public.vw_available_trip_seats OWNER TO movana_owner;
ALTER VIEW public.vw_booking_summary OWNER TO movana_owner;
ALTER VIEW public.vw_driver_trip_summary OWNER TO movana_owner;
ALTER VIEW public.vw_payment_summary OWNER TO movana_owner;
ALTER VIEW public.vw_route_schedule_summary OWNER TO movana_owner;
ALTER VIEW public.vw_trip_current_status OWNER TO movana_owner;
ALTER VIEW public.vw_vehicle_health_summary OWNER TO movana_owner;

-- STEP 6: 7 Custom Application Functions
ALTER FUNCTION public.fn_calculate_trip_available_seats(uuid) OWNER TO movana_owner;
ALTER FUNCTION public.fn_generate_booking_reference() OWNER TO movana_owner;
ALTER FUNCTION public.fn_generate_invoice_number() OWNER TO movana_owner;
ALTER FUNCTION public.fn_log_booking_status_transition() OWNER TO movana_owner;
ALTER FUNCTION public.fn_log_trip_status_transition() OWNER TO movana_owner;
ALTER FUNCTION public.fn_record_audit_log() OWNER TO movana_owner;
ALTER FUNCTION public.fn_set_updated_at() OWNER TO movana_owner;

COMMIT;
```

---

## 14. Exact Rollback Plan

Rollback must reverse only the 128 explicitly transferred objects back to `postgres`. It must NOT use `REASSIGN OWNED`:

```sql
\set ON_ERROR_STOP on
BEGIN;

-- Revert 113 Tables to postgres
ALTER TABLE public.vehicle_location_history OWNER TO postgres;
ALTER TABLE public.vehicle_location_history_default OWNER TO postgres;
-- ... [all 113 tables explicitly reverted] ...

-- Revert 8 Views to postgres
ALTER VIEW public.vw_active_vehicle_locations OWNER TO postgres;
-- ... [all 8 views explicitly reverted] ...

-- Revert 7 Application Functions to postgres
ALTER FUNCTION public.fn_calculate_trip_available_seats(uuid) OWNER TO postgres;
ALTER FUNCTION public.fn_generate_booking_reference() OWNER TO postgres;
ALTER FUNCTION public.fn_generate_invoice_number() OWNER TO postgres;
ALTER FUNCTION public.fn_log_booking_status_transition() OWNER TO postgres;
ALTER FUNCTION public.fn_log_trip_status_transition() OWNER TO postgres;
ALTER FUNCTION public.fn_record_audit_log() OWNER TO postgres;
ALTER FUNCTION public.fn_set_updated_at() OWNER TO postgres;

COMMIT;
```

---

## 15. Backup Requirement Prior to Phase 3D Execution

Before executing Phase 3D, a verified backup of `movana` must be taken:
```powershell
powershell -ExecutionPolicy Bypass -File scripts/database/backup-movana.ps1 -Label "pre_phase3d_ownership"
```
The implementation script must verify that the backup artifact exists and passed validation before initiating the transaction.

---

## 16. Final Readiness Decision

```text
PHASE 3D READINESS: APPROVED WITH CONDITIONS
```

### Mandatory Conditions for Implementation
1. **Pre-Execution Backup Verification:** A complete golden database backup must be created and verified immediately prior to execution.
2. **Explicit Object-by-Object Statements:** Exactly 128 discrete `ALTER ... OWNER TO` statements must be executed inside a single transaction. Blanket `REASSIGN OWNED` is forbidden.
3. **Partition Hierarchy Ordering:** `vehicle_location_history` parent must be altered first, followed by each of the 8 child partition tables.
4. **Extension Object Isolation:** All 271 extension functions, 4 extensions, and 7 extension types must remain owned by `postgres`.
5. **Schema `public` Preservation:** Schema `public` ownership must remain `pg_database_owner`.

---

## 17. Mandatory Final Safety Status

```text
============================================================
MOVANA PHASE 3D — OWNERSHIP READINESS AUDIT
============================================================

TARGET DATABASE: movana
DATABASE VERIFIED: YES

LIVE DATABASE MODIFIED: NO
OWNERSHIP CHANGED: NO
SCHEMA OWNERSHIP CHANGED: NO
TABLE OWNERSHIP CHANGED: NO
VIEW OWNERSHIP CHANGED: NO
FUNCTION OWNERSHIP CHANGED: NO
TYPE OWNERSHIP CHANGED: NO
SEQUENCE OWNERSHIP CHANGED: NO
EXTENSION OWNERSHIP CHANGED: NO

PRIVILEGES CHANGED: NO
DEFAULT PRIVILEGES CHANGED: NO
ROLE ATTRIBUTES CHANGED: NO
ROLE MEMBERSHIPS CHANGED: NO
DATA MODIFIED: NO
RLS MODIFIED: NO
MIGRATION EXECUTED: NO
V026 CREATED: NO
V027 CREATED: NO

PHASE 3C REGRESSION: NOT EXECUTED
PHASE 3D READINESS:
APPROVED WITH CONDITIONS

============================================================
```
