# Movana Database Phase 3B — Role Provisioning Pre-Implementation Readiness & Safety Audit

**Date:** 2026-10-01  
**Target Database:** `movana` (PostgreSQL 16.13, localhost:5432)  
**Audit Mode:** STRICTLY READ-ONLY (No state-changing DDL, DML, DCL, or role modifications executed)  
**Authoritative Baselines:**
- `docs/database/phase3-roles-permissions-design.md`
- `docs/database/phase3-privilege-matrix.csv`
- `docs/database/v025-post-execution-verification.md`

---

## 1. Executive Summary

This pre-implementation safety audit was conducted to verify whether the live PostgreSQL database **`movana`** is in a sound, verified, and safe state to proceed with **Phase 3B: Role Provisioning**. 

The intended four-role security model:
1. `movana_owner` (NOLOGIN schema and domain object owner)
2. `movana_migration` (LOGIN deployer / CI/CD runner, member of `movana_owner`)
3. `movana_app` (LOGIN runtime service account for backend APIs and background workers)
4. `movana_readonly` (LOGIN read-only account for BI, analytics, and reporting)

All catalog verification checks have confirmed that **zero Movana roles currently exist**, zero role-name collisions exist, all 113 base tables, 8 views, 345 indexes, and 193 foreign keys are completely intact, and no conflicting object ACLs are present.

Readiness Decision: **`APPROVED WITH CONDITIONS`**  
*(Approved subject to documented implementation safeguards regarding extension ownership protection and sensitive table ACL restrictions).*

---

## 2. Target Database & Engine Verification

Live catalog verification executed:
```sql
SELECT current_database(), current_user, session_user, version();
```

| Field | Expected Value | Actual Live Catalog Value | Status |
| :--- | :--- | :--- | :---: |
| **Database** | `movana` | `movana` | **VERIFIED** |
| **Current User** | `postgres` | `postgres` | **VERIFIED** |
| **Session User** | `postgres` | `postgres` | **VERIFIED** |
| **PostgreSQL Version**| `16.13` | `PostgreSQL 16.13, compiled by Visual C++ build 1944, 64-bit` | **VERIFIED** |

*Assertion:* Connection strictly confirmed to database `movana`. Zero interaction with foreign databases occurred.

---

## 3. Current Role Inventory & Collision Analysis

Query against `pg_roles`:
```sql
SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin, 
       rolreplication, rolconnlimit, rolpassword IS NOT NULL AS has_password, rolbypassrls 
FROM pg_roles 
WHERE rolname IN ('movana_owner', 'movana_app', 'movana_readonly', 'movana_migration') 
   OR rolname LIKE 'movana%';
```
**Result:** Exactly `0 rows` returned.

| Target Role Name | Pre-existing in Catalog? | Collision Risk | Intended Login Attribute | Intended Superuser Attribute |
| :--- | :---: | :---: | :---: | :---: |
| `movana_owner` | **NO** | None | `NOLOGIN` | `NOSUPERUSER` |
| `movana_migration` | **NO** | None | `LOGIN` | `NOSUPERUSER` |
| `movana_app` | **NO** | None | `LOGIN` | `NOSUPERUSER` |
| `movana_readonly` | **NO** | None | `LOGIN` | `NOSUPERUSER` |

### Role Membership Feasibility
Inspection of `pg_auth_members` confirms zero existing custom memberships. The planned role inheritance hierarchy:
```sql
GRANT movana_owner TO movana_migration;
```
can be established cleanly with zero circularity, zero privilege leakage, and zero membership conflict.

---

## 4. Current Object Ownership Analysis

Exhaustive catalog query against `pg_class`, `pg_proc`, `pg_type`, `pg_namespace`, and `pg_database`:

| Object Category | Total Count | Current Catalog Owner | Proposed Phase 3 Target Owner |
| :--- | :---: | :---: | :---: |
| **Database `movana`** | 1 | `postgres` | `postgres` (or `movana_owner`) |
| **Schema `public`** | 1 | `pg_database_owner` | `movana_owner` (or `pg_database_owner`) |
| **Ordinary Tables (`r`)** | 112 | `postgres` (100%) | `movana_owner` |
| **Partitioned Table (`p`)** | 1 | `postgres` (100%) | `movana_owner` |
| **Child Partitions** | 8 | `postgres` (100%) | `movana_owner` |
| **Views (`v`)** | 8 | `postgres` (100%) | `movana_owner` |
| **Indexes (Ordinary + Part)**| 345 | `postgres` (100%) | `movana_owner` |
| **Custom Application Functions**| 7 | `postgres` (100%) | `movana_owner` |
| **Extension Functions** | 271 | `postgres` (100%) | `postgres` (MUST REMAIN) |
| **Extensions** | 4 | `postgres` (100%) | `postgres` (MUST REMAIN) |
| **Composite Types (Relations)**| 121 | `postgres` (100%) | `movana_owner` |

*Verification:* The Phase 3 baseline statement is 100% accurate: all Movana application objects are currently owned by `postgres`.

---

## 5. Database & Schema Privilege Analysis

### 5.1 Database `movana` ACL
- `datacl`: `NULL` (PostgreSQL default privileges apply).
- `PUBLIC CONNECT`: `true` (Any authenticated cluster account can connect).
- `PUBLIC TEMPORARY`: `true` (Connected accounts can create temp tables).
- `PUBLIC CREATE`: `false` (No schema creation allowed).

### 5.2 Schema `public` ACL
- `nspacl`: `{pg_database_owner=UC/pg_database_owner,=U/pg_database_owner}`.
- `PUBLIC USAGE`: `true`.
- `PUBLIC CREATE`: `false` (Hardened in PostgreSQL 16).

---

## 6. Table & View ACL Analysis

Inspected all 113 tables and 8 views across `pg_class.relacl` and `information_schema.role_table_grants`:
- **Custom Table ACLs:** Exactly **0** non-null `relacl` entries exist across all 121 relations.
- **Grants:** `postgres` holds sole owner access.
- **`PUBLIC` Access:** Verified `false` for `SELECT`, `INSERT`, `UPDATE`, `DELETE` across all relations.
- Key operational tables (`users`, `bookings`, `payments`, `drivers`, `trips`, `routes`, `stops`, `audit_logs`) are strictly protected from anonymous/public access.

---

## 7. Sensitive Table Discovery & Security Classification

Dynamic query targeting tables with sensitive terminology (`token`, `password`, `session`, `credential`, `secret`, `auth`, `verification`, `reset`, `audit`, `security`, `payment`, `refund`, `emergency`, `location`, `tracking`):

| Table Name | Sensitivity Justification | Current Owner | Current ACL |
| :--- | :--- | :---: | :---: |
| `audit_logs` | Immutable System Audit Trail | `postgres` | Owner Only |
| `driver_emergency_contacts` | Emergency Contact Details (PII) | `postgres` | Owner Only |
| `driver_verifications` | Identity & License Verification | `postgres` | Owner Only |
| `email_verification_tokens` | Authentication / Verification Token | `postgres` | Owner Only |
| `emergency_contacts` | Emergency Contact Details (PII) | `postgres` | Owner Only |
| `emergency_events` | Emergency Incident Events (PII) | `postgres` | Owner Only |
| `passenger_profiles` | Personal Identifiable Information (PII) | `postgres` | Owner Only |
| `password_reset_tokens` | Authentication / Reset Token Hash | `postgres` | Owner Only |
| `payment_attempts` | Financial Gateway Transactions | `postgres` | Owner Only |
| `payment_events` | Financial Gateway Payloads | `postgres` | Owner Only |
| `payment_methods` | Stored Gateway Customer & Card Tokens | `postgres` | Owner Only |
| `payment_transactions` | Ledger Accounting Records | `postgres` | Owner Only |
| `payments` | Core Payment Records | `postgres` | Owner Only |
| `refund_transactions` | Gateway Refund Transactions | `postgres` | Owner Only |
| `refunds` | Refund Ledger | `postgres` | Owner Only |
| `security_events` | Security Events Log | `postgres` | Owner Only |
| `tracking_devices` | Telemetry Hardware Identity / IMEI | `postgres` | Owner Only |
| `tracking_events` | High-frequency Vehicle Telemetry | `postgres` | Owner Only |
| `user_addresses` | User Physical Addresses (PII) | `postgres` | Owner Only |
| `user_preferences` | User Settings & Preferences | `postgres` | Owner Only |
| `user_roles` | Security RBAC Assignments | `postgres` | Owner Only |
| `user_sessions` | Active User Authentication Sessions | `postgres` | Owner Only |
| `users` | Core User Identity & Password Hashes | `postgres` | Owner Only |
| `vehicle_location_history` (all 8 parts)| Real-time Geolocation History | `postgres` | Owner Only |

---

## 8. Functions, Procedures & Search-Path Verification

Catalog inspection of `pg_proc` for custom routines:
- **Total Functions in `public`:** 278 (7 custom application functions, 271 extension functions).
- **Security Definer Count:** Exactly **0** `SECURITY DEFINER` functions exist. All 278 functions are `SECURITY INVOKER`.
- **Search Path Hardening Status:** All 7 custom functions have `proconfig = {"search_path=public, pg_temp"}`:
  1. `fn_calculate_trip_available_seats(uuid)`: `{"search_path=public, pg_temp"}` (VOLATILE)
  2. `fn_generate_booking_reference()`: `{"search_path=public, pg_temp"}` (VOLATILE)
  3. `fn_generate_invoice_number()`: `{"search_path=public, pg_temp"}` (VOLATILE)
  4. `fn_log_booking_status_transition()`: `{"search_path=public, pg_temp"}` (VOLATILE)
  5. `fn_log_trip_status_transition()`: `{"search_path=public, pg_temp"}` (VOLATILE)
  6. `fn_record_audit_log()`: `{"search_path=public, pg_temp"}` (VOLATILE)
  7. `fn_set_updated_at()`: `{"search_path=public, pg_temp"}` (VOLATILE)
- **PUBLIC Execute:** `public_execute = true` (PostgreSQL default). Must be revoked during Phase 3 privilege hardening.

---

## 9. Extension Objects & Ownership Safeguard

Inspected installed extensions:
- `btree_gist` (v1.7): 258 dependent objects in `public`
- `citext` (v1.6): 88 dependent objects in `public`
- `pgcrypto` (v1.3): 36 dependent objects in `public`
- `plpgsql` (v1.0): 4 dependent objects in `pg_catalog`

> [!CRITICAL]
> **Extension Ownership Safeguard:** All 382 extension objects are owned by `postgres`. Blanket execution of `REASSIGN OWNED BY postgres TO movana_owner;` will attempt to reassign extension-managed types and functions, resulting in errors. **Condition for Implementation:** Reassign ownership explicitly for tables, views, custom functions, and partition tables; do NOT reassign extensions.

---

## 10. Default ACL, RLS & Sequence Inventory

- **`pg_default_acl` Entries:** **0 rows**.
- **Tables with RLS Enabled:** **0 of 113**.
- **Configured RLS Policies:** **0**.
- **Sequences (`pg_sequences`):** **0 sequences**. Movana relies on UUIDs and deterministic generators.
- **Custom Enums / Domains:** **0**. All enumerations are managed via check constraints and lookup tables.

---

## 11. Foreign Key & Trigger Integrity

- **Foreign Keys:** All **193 foreign keys** are active and valid.
  - *Privilege Impact:* Because `movana_app` will have `SELECT` on all operational and reference tables, PostgreSQL foreign-key constraint enforcement will function with zero permission errors.
- **Triggers:** All **62 user triggers** (origin/local) execute custom functions (`fn_set_updated_at`, `fn_record_audit_log`, `fn_log_trip_status_transition`, `fn_log_booking_status_transition`).
  - *Privilege Impact:* When tables and functions are transferred to `movana_owner`, triggers will execute under uniform ownership. Because `movana_app` will have `INSERT` on `audit_logs`, the audit trigger will execute without constraint violations.

---

## 12. Partition Architecture Status

`vehicle_location_history` verified:
- Parent table: `vehicle_location_history` (owned by `postgres`, 1,600 rows).
- Attached child partitions: Exactly 8 (Default, Sep 2026, Oct 2026, Nov 2026, Dec 2026, Jan 2027, Feb 2027, Mar 2027).
- Partition bounds: Contiguous and disjoint with zero overlap.
- Default partition: Attached and clean (0 rows).

---

## 13. Migration Runner & Backend Compatibility

### 13.1 Migration Runner (`scripts/database/migrate-movana.ps1`)
- Param line 12: `[string]$User = $(if ($env:DB_ADMIN_USER) { $env:DB_ADMIN_USER } elseif ($env:DB_USER) { $env:DB_USER } else { "postgres" })`.
- *Finding:* The runner already supports non-superuser execution via `$env:DB_ADMIN_USER` or `-User`.
- *Migration Execution:* When running as `movana_migration`, adding `SET ROLE movana_owner;` at the beginning of future migrations ensures all new objects are owned by `movana_owner`.

### 13.2 Backend Configuration (`.env.example`)
- Line 15: `DB_NAME=movana`
- Line 16: `DB_USER=movana_app`
- Line 24: `DB_ADMIN_USER=postgres`
- *Finding:* The codebase was architected from inception to connect runtime services using `movana_app`. No backend source code changes are required; only role provisioning and secret population in `.env` are needed.

---

## 14. Detailed Table Categorization & Least-Privilege Grants

| Category | Description | Representative Tables | `movana_app` | `movana_readonly` | `movana_migration` |
| :--- | :--- | :--- | :---: | :---: | :---: |
| **Category A** | Runtime Operational | `bookings`, `trips`, `payments`, `vehicles`, `drivers`, `support_tickets`, `reviews`, `vehicle_location_history` | `SELECT, INSERT, UPDATE, DELETE` (NO `TRUNCATE`) | `SELECT` | `ALL` |
| **Category B** | Sensitive Authentication | `password_reset_tokens`, `email_verification_tokens`, `user_sessions`, `payment_methods` | `SELECT, INSERT, UPDATE, DELETE` | **NO ACCESS** | `ALL` |
| **Category C** | Audit & Security Logs | `audit_logs`, `security_events`, `login_attempts` | `SELECT, INSERT` (NO `UPDATE`, NO `DELETE`) | `SELECT` | `ALL` |
| **Category D** | Reference & Catalogs | `routes`, `stops`, `schedules_calendars`, `fare_products`, `vehicle_types`, `system_settings` | `SELECT` | `SELECT` | `ALL` |
| **Category E** | Operational Views | 8 views (`vw_booking_summary`, `vw_trip_current_status`, etc.) | `SELECT` | `SELECT` | `ALL` |
| **Category F** | Migration Tracking | `schema_migrations` | **NO ACCESS** | **NO ACCESS** | `ALL` |

---

## 15. Risk Assessment & Classification

- **CRITICAL (GAP-01):** Cluster currently operates under raw `postgres` superuser access.
- **HIGH (GAP-02):** `PUBLIC` has `CONNECT` and `TEMPORARY` on database `movana`.
- **HIGH (Implementation):** Potential risk of corrupting extension dependencies if blanket `REASSIGN OWNED` is used.
- **MEDIUM (GAP-03):** Empty `pg_default_acl` would deny privileges to `movana_app` on newly created migration tables.
- **MEDIUM (GAP-04):** `PUBLIC` has default `EXECUTE` on custom routines.
- **LOW (GAP-05):** Operational maintenance currently requires superuser credentials.

---

## 16. Required Corrections Before Implementation

1. **Role Provisioning Delivery Mechanism:** In PostgreSQL, `CREATE ROLE` is a global cluster-level statement that should not be placed inside transaction-wrapped migration files. Role provisioning must be executed via an idempotent administrative script: [`scripts/database/provision-roles.ps1`](file:///c:/Users/Manoj/OneDrive/Desktop/Movana/scripts/database/provision-roles.ps1).
2. **Explicit Object Ownership Reassignment:** Ownership migration must explicitly target domain tables, views, custom functions, and composite types, specifically excluding the 4 installed extensions.
3. **Privilege Granularity on Audit Tables:** Explicitly revoke `UPDATE` and `DELETE` on `audit_logs` and `security_events` from `movana_app` to preserve audit immutability.
4. **Token Isolation:** Deny `movana_readonly` access to `password_reset_tokens`, `email_verification_tokens`, and `user_sessions`.

---

## 17. Validated Rollback Plan

If rollback is ever required, the following sequence executed by `postgres` safely restores the baseline state:

```sql
-- 1. Reassign domain object ownership back to postgres
REASSIGN OWNED BY movana_owner TO postgres;

-- 2. Restore default PUBLIC privileges
GRANT CONNECT, TEMPORARY ON DATABASE movana TO PUBLIC;
GRANT USAGE ON SCHEMA public TO PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO PUBLIC;

-- 3. Drop all owned permissions and default ACLs for Movana roles
DROP OWNED BY movana_app, movana_readonly, movana_migration, movana_owner;

-- 4. Drop the four roles
DROP ROLE IF EXISTS movana_app;
DROP ROLE IF EXISTS movana_readonly;
DROP ROLE IF EXISTS movana_migration;
DROP ROLE IF EXISTS movana_owner;
```

---

## 18. Final Readiness Decision

```text
PHASE 3B READINESS: APPROVED WITH CONDITIONS
```

**Conditions:**
1. Role creation must be performed via an administrative script outside versioned migrations.
2. Ownership transfer must explicitly exclude installed extensions.
3. Category B sensitive token tables must be excluded from `movana_readonly`.
4. Category C audit tables must be restricted to append-only (`INSERT, SELECT`) for `movana_app`.

---

## 19. Mandatory Final Safety Status

```text
============================================================
MOVANA PHASE 3B PRE-PROVISIONING VALIDATION
============================================================

TARGET DATABASE: movana
DATABASE VERIFIED: YES

LIVE DATABASE MODIFIED: NO
ROLES CREATED: NO
ROLES ALTERED: NO
ROLES DROPPED: NO
PRIVILEGES CHANGED: NO
OWNERSHIP CHANGED: NO
PASSWORDS CREATED/CHANGED: NO
DEFAULT PRIVILEGES CHANGED: NO
RLS CHANGED: NO
SCHEMA MODIFIED: NO
TABLES MODIFIED: NO
DATA MODIFIED: NO
MIGRATION EXECUTED: NO
V026 CREATED: NO
V027 CREATED: NO

ROLE PROVISIONING READINESS: APPROVED WITH CONDITIONS
============================================================
```
