# Movana Database Phase 3C — Privileges & Default ACLs Execution Report

**Execution Timestamp:** 2026-10-01 12:12:48 IST  
**Target Database:** `movana` (PostgreSQL 16.13, localhost:5432)  
**Execution Script:** `scripts/database/apply-phase3c-privileges.ps1`  
**Execution Mode:** LIVE ATOMIC TRANSACTIONAL HARDENING  
**Scope:** PRIVILEGES & DEFAULT ACLs ONLY (Zero ownership, data, migration, or RLS changes)  
**Rollback Script:** `scripts/database/rollback-phase3c-privileges.ps1`  

---

## 1. Executive Summary

Phase 3C of the Movana PostgreSQL security architecture has been executed successfully against the live PostgreSQL database `movana`. The execution was performed within a single atomic transaction with `ON_ERROR_STOP=1`.

All 5 mandatory conditions established during the Phase 3C readiness audit were strictly satisfied:
1. **Extension Function Preservation:** Zero extension routines had their `PUBLIC EXECUTE` privilege revoked. All 271 extension functions (`btree_gist`, `citext`, `pgcrypto`) remain fully operational, and `citext` operators continue to execute seamlessly.
2. **Default Privileges Creator Alignment:** Default privileges were explicitly configured for role `movana_owner` (and mirrored for `movana_migration`) in schema `public` across tables, sequences, routines, and types.
3. **Audit Log Immutability:** `movana_app` was restricted strictly to `SELECT` and `INSERT` on `audit_logs`, `security_events`, and `login_attempts`. All mutation privileges (`UPDATE`, `DELETE`, `TRUNCATE`) were revoked and verified as denied.
4. **Sensitive Category B Isolation:** `movana_readonly` received `NO ACCESS` (zero table grants) across all 5 sensitive token tables (`password_reset_tokens`, `email_verification_tokens`, `user_sessions`, `payment_methods`, `driver_verifications`).
5. **Database Cluster Isolation:** `PUBLIC CONNECT` and `PUBLIC TEMPORARY` were revoked from database `movana`. Unrelated cluster roles (including `maritime_user`) are strictly denied connection (`FATAL: permission denied for database "movana"`), while the four Movana roles retain explicit access.

Post-implementation catalog inspection, functional tests, and negative security tests confirmed 100% compliance across all 121 relations, 278 routines, and 8 default ACL rules.

---

## 2. Target Database & Engine Baseline Verification

```sql
SELECT current_database(), current_user, session_user, version();
```

| Metric | Expected Value | Catalog Verified Value | Status |
| :--- | :--- | :--- | :---: |
| **Database Name** | `movana` | `movana` | **PASS** |
| **Session User** | `postgres` | `postgres` | **PASS** |
| **Current User** | `postgres` | `postgres` | **PASS** |
| **PostgreSQL Version** | `16.13` | `PostgreSQL 16.13, compiled by Visual C++ build 1944, 64-bit` | **PASS** |

*Foreign Database Isolation:* Zero operations were performed against any other cluster database (`postgres`, `chatbot_db`, `cyber_investigation`, `dayflow`, `localhero`, `localhero_db`, `maritime_m3_db`, `movana_db`, `skillbridge_ai`).

---

## 3. Role Inventory & Membership Verification

### Role Baseline (pg_roles)
All four dedicated Movana roles provisioned in Phase 3B were verified with exact attributes intact:

| Role Name | Login | Superuser | CreateDB | CreateRole | Inherit | Replication | BypassRLS | Status |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **`movana_owner`** | `f` | `f` | `f` | `f` | `f` | `f` | `f` | **VERIFIED** |
| **`movana_app`** | `t` | `f` | `f` | `f` | `t` | `f` | `f` | **VERIFIED** |
| **`movana_readonly`** | `t` | `f` | `f` | `f` | `t` | `f` | `f` | **VERIFIED** |
| **`movana_migration`**| `t` | `f` | `f` | `f` | `t` | `f` | `f` | **VERIFIED** |

### Role Memberships (pg_auth_members)
- **Active Membership:** Exactly 1: `movana_owner -> movana_migration`
- **Application Isolation:** `movana_app` and `movana_readonly` hold **zero** memberships in `movana_owner` or each other.

---

## 4. Database-Level Privilege Changes

```sql
GRANT CONNECT, TEMPORARY ON DATABASE movana TO movana_owner, movana_app, movana_migration;
GRANT CONNECT ON DATABASE movana TO movana_readonly;
REVOKE TEMPORARY, CONNECT ON DATABASE movana FROM PUBLIC;
```

### Live Catalog Verification (`has_database_privilege`)

| Role | `CONNECT` Privilege | `TEMPORARY` Privilege | `CREATE` Privilege | Status |
| :--- | :---: | :---: | :---: | :---: |
| **`PUBLIC`** | **`false`** | **`false`** | `false` | **HARDENED** |
| **`movana_owner`** | `true` | `true` | `false` | **VERIFIED** |
| **`movana_app`** | `true` | `true` | `false` | **VERIFIED** |
| **`movana_readonly`** | `true` | **`false`** | `false` | **LEAST-PRIVILEGE** |
| **`movana_migration`**| `true` | `true` | `false` | **VERIFIED** |
| **`maritime_user` (External)** | **DENIED** | **DENIED** | **DENIED** | **ISOLATED** |

*Verification:* Attempting connection as `maritime_user` against `movana` returns:  
`psql: error: connection to server at "localhost" (::1), port 5432 failed: FATAL: permission denied for database "movana"`

---

## 5. Schema-Level Privilege Changes (Schema `public`)

```sql
GRANT USAGE, CREATE ON SCHEMA public TO movana_owner, movana_migration;
GRANT USAGE ON SCHEMA public TO movana_app, movana_readonly;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
```

### Live Catalog Verification (`has_schema_privilege`)

| Role | `USAGE` | `CREATE` | Security Assessment |
| :--- | :---: | :---: | :--- |
| **`PUBLIC`** | `true` | **`false`** | Cannot create tables/objects in public schema |
| **`movana_app`** | `true` | **`false`** | Cannot execute DDL or modify schema objects |
| **`movana_readonly`** | `true` | **`false`** | Cannot execute DDL or create temporary schemas |
| **`movana_owner`** | `true` | `true` | Authorized to create/alter schema objects |
| **`movana_migration`**| `true` | `true` | Authorized deployment runner role |

---

## 6. Table & View Privileges by Category

All 113 base tables and 8 views (121 relations) in schema `public` were audited:

```sql
SELECT category, count(*) AS total_tables,
       count(*) FILTER (WHERE app_sel) AS app_can_sel,
       count(*) FILTER (WHERE app_ins) AS app_can_ins,
       count(*) FILTER (WHERE app_upd) AS app_can_upd,
       count(*) FILTER (WHERE app_del) AS app_can_del,
       count(*) FILTER (WHERE app_trunc) AS app_can_trunc,
       count(*) FILTER (WHERE ro_sel) AS ro_can_sel,
       count(*) FILTER (WHERE ro_ins OR ro_upd OR ro_del) AS ro_can_modify
FROM table_audit GROUP BY category;
```

### Dynamic Catalog Audit Matrix

| Category | Description | Count | `movana_app` Permissions | `movana_readonly` Permissions | `movana_owner` / `movana_migration` |
| :--- | :--- | :---: | :--- | :--- | :--- |
| **A: Operational** | Core OLTP tables (`bookings`, `trips`, `users`, `vehicles`, etc.) | **78** | `SELECT, INSERT, UPDATE, DELETE` (0 TRUNCATE) | `SELECT` (0 Modify) | `ALL PRIVILEGES` |
| **B: Sensitive** | Auth & token tables (`password_reset_tokens`, `email_verification_tokens`, `user_sessions`, `payment_methods`, `driver_verifications`) | **5** | `SELECT, INSERT, UPDATE, DELETE` (0 TRUNCATE) | **NO ACCESS (0 Grants)** | `ALL PRIVILEGES` |
| **C: Audit Logs** | Immutable system logs (`audit_logs`, `security_events`, `login_attempts`) | **3** | `SELECT, INSERT` (0 UPDATE, 0 DELETE, 0 TRUNCATE) | `SELECT` (0 Modify) | `ALL PRIVILEGES` |
| **D: Reference** | Static reference & catalog data (`routes`, `stops`, `fare_rules`, `roles`, etc.) | **26** | `SELECT` (0 INSERT, 0 UPDATE, 0 DELETE, 0 TRUNCATE) | `SELECT` (0 Modify) | `ALL PRIVILEGES` |
| **E: Views** | Operational & analytics views (`vw_booking_summary`, etc.) | **8** | `SELECT` (0 Modify) | `SELECT` (0 Modify) | `ALL PRIVILEGES` |
| **F: Ledger** | Flyway migration ledger (`schema_migrations`) | **1** | **NO ACCESS (0 Grants)** | **NO ACCESS (0 Grants)** | `ALL PRIVILEGES` |
| **TOTAL** | All Schema Relations | **121** | **Least-Privilege Enforced** | **Least-Privilege Enforced** | **Owner Enforced** |

---

## 7. Application Functions & Extension Safety

```sql
-- Revoke PUBLIC EXECUTE on 7 custom application functions
REVOKE EXECUTE ON FUNCTION public.fn_calculate_trip_available_seats(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_generate_booking_reference() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_generate_invoice_number() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_log_booking_status_transition() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_log_trip_status_transition() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_record_audit_log() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_set_updated_at() FROM PUBLIC;

-- Explicit grants to application roles
GRANT EXECUTE ON FUNCTION public.fn_calculate_trip_available_seats(uuid) TO movana_app, movana_readonly;
GRANT EXECUTE ON FUNCTION public.fn_generate_booking_reference() TO movana_app;
GRANT EXECUTE ON FUNCTION public.fn_generate_invoice_number() TO movana_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO movana_owner, movana_migration;
```

### Verification Findings
- **Custom Application Functions:** `has_function_privilege('public', p.oid, 'EXECUTE')` = `0` (Zero custom routines executable by unauthenticated/public callers).
- **Extension Routines Preserved (271 functions):** All extension routines for `citext`, `btree_gist`, and `pgcrypto` remained untouched.
- **Operator Verification:** Queries with `citext_eq` (`WHERE email = 'test@example.com'::citext`) and `pgcrypto` functions (`digest('test', 'sha256')`) executed successfully under both `movana_app` and `movana_readonly`.

---

## 8. Default ACLs Configuration (`pg_default_acl`)

Default ACLs were created for the actual object-creating role `movana_owner` and mirrored for `movana_migration`:

```sql
-- Configured FOR ROLE movana_owner and FOR ROLE movana_migration:
ALTER DEFAULT PRIVILEGES FOR ROLE movana_owner IN SCHEMA public 
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO movana_app;
ALTER DEFAULT PRIVILEGES FOR ROLE movana_owner IN SCHEMA public 
    GRANT SELECT ON TABLES TO movana_readonly;
ALTER DEFAULT PRIVILEGES FOR ROLE movana_owner IN SCHEMA public 
    GRANT ALL PRIVILEGES ON TABLES TO movana_owner, movana_migration;

ALTER DEFAULT PRIVILEGES FOR ROLE movana_owner IN SCHEMA public 
    GRANT USAGE, SELECT ON SEQUENCES TO movana_app;
ALTER DEFAULT PRIVILEGES FOR ROLE movana_owner IN SCHEMA public 
    GRANT ALL PRIVILEGES ON SEQUENCES TO movana_owner, movana_migration;

ALTER DEFAULT PRIVILEGES FOR ROLE movana_owner IN SCHEMA public 
    REVOKE EXECUTE ON ROUTINES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE movana_owner IN SCHEMA public 
    GRANT EXECUTE ON ROUTINES TO movana_app, movana_owner, movana_migration;

ALTER DEFAULT PRIVILEGES FOR ROLE movana_owner IN SCHEMA public 
    GRANT USAGE ON TYPES TO movana_app, movana_readonly, movana_owner, movana_migration;
```

### Catalog Verification
Live query against `pg_default_acl`:
- **Total entries:** Exactly **8 rows** (4 for `movana_owner`, 4 for `movana_migration`).
- **Object types covered:** `r` (tables/views), `S` (sequences), `f` (routines), `T` (types).

---

## 9. Positive Functional Verification Suite

Executed inside safe transactions with `ROLLBACK;`:

| Test Case | Actor Role | Statement Tested | Result | Status |
| :--- | :--- | :--- | :--- | :---: |
| **Seat Calculation** | `movana_app` | `SELECT fn_calculate_trip_available_seats(...)` | Returned `39` | **PASS** |
| **Booking Reference** | `movana_app` | `SELECT fn_generate_booking_reference()` | Returned `MOV-NRNL-U4YB` | **PASS** |
| **Invoice Generator** | `movana_app` | `SELECT fn_generate_invoice_number()` | Returned `INV-2026-794BE8` | **PASS** |
| **Citext Extension** | `movana_app` | `SELECT count(*) FROM users WHERE email = ...::citext` | Executed without operator error | **PASS** |
| **Pgcrypto Extension**| `movana_app` | `SELECT digest('security_test', 'sha256')` | Returned sha256 bytea digest | **PASS** |
| **Category A CRUD** | `movana_app` | `INSERT INTO reviews ...`, `UPDATE ...`, `DELETE ...` | Inserted 1, Updated 1, Deleted 1 | **PASS** |
| **Category C Append**| `movana_app` | `INSERT INTO audit_logs ...` | Inserted 1 (append-only) | **PASS** |
| **Category C Append**| `movana_app` | `INSERT INTO security_events ...` | Inserted 1 (append-only) | **PASS** |
| **Category C Append**| `movana_app` | `INSERT INTO login_attempts ...` | Inserted 1 (append-only) | **PASS** |
| **Readonly SELECT** | `movana_readonly` | `SELECT count(*) FROM users; routes; vw_booking_summary;` | Returned 68 users, 11 routes, 61 bookings | **PASS** |
| **Readonly Function**| `movana_readonly` | `SELECT fn_calculate_trip_available_seats(...)` | Returned `39` | **PASS** |

---

## 10. Negative Security Denial Verification Suite

Executed using a standalone test suite with `SET ROLE <role>; <statement>; ROLLBACK;`:

| Security Boundary Test | Tested Role | Operation | Expected Error | Actual Catalog Result | Status |
| :--- | :--- | :--- | :--- | :--- | :---: |
| **Audit Logs Immutability** | `movana_app` | `UPDATE public.audit_logs ...` | `permission denied` | `ERROR: permission denied for table audit_logs` | **PASS** |
| **Audit Logs Immutability** | `movana_app` | `DELETE FROM public.audit_logs` | `permission denied` | `ERROR: permission denied for table audit_logs` | **PASS** |
| **Audit Logs Immutability** | `movana_app` | `TRUNCATE public.audit_logs` | `permission denied` | `ERROR: permission denied for table audit_logs` | **PASS** |
| **Security Events Immutability**| `movana_app` | `UPDATE public.security_events ...` | `permission denied` | `ERROR: permission denied for table security_events` | **PASS** |
| **Login Attempts Immutability** | `movana_app` | `UPDATE public.login_attempts ...` | `permission denied` | `ERROR: permission denied for table login_attempts` | **PASS** |
| **App Ledger Isolation** | `movana_app` | `SELECT * FROM public.schema_migrations` | `permission denied` | `ERROR: permission denied for table schema_migrations` | **PASS** |
| **Readonly Ledger Isolation** | `movana_readonly`| `SELECT * FROM public.schema_migrations` | `permission denied` | `ERROR: permission denied for table schema_migrations` | **PASS** |
| **Category B Token Isolation** | `movana_readonly`| `SELECT * FROM public.password_reset_tokens` | `permission denied` | `ERROR: permission denied for table password_reset_tokens` | **PASS** |
| **Category B Token Isolation** | `movana_readonly`| `SELECT * FROM public.email_verification_tokens`| `permission denied` | `ERROR: permission denied for table email_verification_tokens`| **PASS** |
| **Category B Session Isolation**| `movana_readonly`| `SELECT * FROM public.user_sessions` | `permission denied` | `ERROR: permission denied for table user_sessions` | **PASS** |
| **Category B Payment Isolation**| `movana_readonly`| `SELECT * FROM public.payment_methods` | `permission denied` | `ERROR: permission denied for table payment_methods` | **PASS** |
| **Category B Driver Verification**| `movana_readonly`| `SELECT * FROM public.driver_verifications` | `permission denied` | `ERROR: permission denied for table driver_verifications` | **PASS** |
| **Readonly Write Protection** | `movana_readonly`| `INSERT INTO public.users ...` | `permission denied` | `ERROR: permission denied for table users` | **PASS** |
| **Readonly Write Protection** | `movana_readonly`| `UPDATE public.trips ...` | `permission denied` | `ERROR: permission denied for table trips` | **PASS** |
| **Readonly Write Protection** | `movana_readonly`| `DELETE FROM public.bookings` | `permission denied` | `ERROR: permission denied for table bookings` | **PASS** |
| **Readonly Truncate Protection**| `movana_readonly`| `TRUNCATE public.reviews` | `permission denied` | `ERROR: permission denied for table reviews` | **PASS** |
| **App Truncate Protection** | `movana_app` | `TRUNCATE public.reviews` | `permission denied` | `ERROR: permission denied for table reviews` | **PASS** |
| **App DDL Protection** | `movana_app` | `CREATE TABLE public.should_fail ...` | `permission denied` | `ERROR: permission denied for schema public` | **PASS** |
| **Readonly DDL Protection** | `movana_readonly`| `CREATE TABLE public.should_fail ...` | `permission denied` | `ERROR: permission denied for schema public` | **PASS** |

**Negative Security Tests Result:** 19 PASSED, 0 FAILED.

---

## 11. Object Ownership & RLS Verification

- **Object Ownership:** Verified 100% unchanged. All 121 relations and 278 routines remain owned by `postgres`. (Ownership transfer is strictly deferred to Phase 3D).
- **Row Level Security (RLS):** Verified `rls_enabled_tables = 0`. No tables or policies were altered.
- **Foreign Keys:** All 193 foreign keys remain active and intact.
- **Declarative Partitions:** All 8 GPS partitions (`vehicle_location_history_y2026m09` through `vehicle_location_history_y2027m03` and `vehicle_location_history_default`) remain attached and active.

---

## 12. Data Integrity & Migration Regression Verification

### Live Record Counts
- `users`: **68** (Expected: 68) — PASS
- `bookings`: **181** (Expected: 181) — PASS
- `trips`: **61** (Expected: 61) — PASS
- `vehicle_location_history`: **1600** (Expected: 1600) — PASS

### Verification Scripts Executed
1. `powershell -ExecutionPolicy Bypass -File .\scripts\database\verify-movana.ps1`
   - Schema objects inspected: 113 tables, 8 views, 278 functions, 73 triggers, 345 indexes, 193 foreign keys.
   - Result: **SUCCESS** (Exit code 0).
2. `psql -h localhost -p 5432 -U postgres -d movana -f database/tests/database_integrity.sql`
   - Verification suite: Table Inventory, PK Integrity, Concurrency Protection, Payment Idempotency, Check Constraints, Geospatial Bounds, Rating Constraints, GPS Partitioning Routing, Operational Views.
   - Result: **9 PASSED, 0 FAILED**.

---

## 13. Rollback Readiness

The dedicated rollback script [`scripts/database/rollback-phase3c-privileges.ps1`](file:///c:/Users/Manoj/OneDrive/Desktop/Movana/scripts/database/rollback-phase3c-privileges.ps1) has been created, syntax-validated, and verified in dry-run mode (`-CheckOnly`).
- Safely reverses database, schema, table, view, function, and default ACLs.
- Restores `relacl = NULL` across all 121 relations and `pg_default_acl` to 0 rows.
- Re-enables `PUBLIC CONNECT` on database `movana`.
- Does not drop roles, alter ownership, or touch data.
- The rollback script remains on standby and was NOT executed following the successful implementation.

---

## 14. Final Execution Conclusion

```text
PHASE 3C IMPLEMENTATION: SUCCESS
LEAST-PRIVILEGE SECURITY HARDENING: COMPLETE
READY FOR PHASE 3D (OWNERSHIP TRANSFER)
```
