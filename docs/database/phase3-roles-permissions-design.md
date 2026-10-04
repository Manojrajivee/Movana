# Movana Database Phase 3 — Roles, Ownership & Least-Privilege Access Design

**Date:** 2026-10-01  
**Target Database:** `movana` (PostgreSQL 16.13, localhost:5432)  
**Status:** DESIGN & AUDIT ONLY (Strictly Read-Only Catalog Review)  
**Live Database Modifications:** NONE (Zero DDL, DML, DCL, or role modifications executed)

---

## 1. Executive Summary

Following the successful execution and post-execution verification of Migration `V025__database_optimizations.sql`, the Movana database is structurally hardened with 113 base tables, 8 views, 345 indexes, 193 foreign keys, 278 functions/routines, and 25 verified migrations.

However, an exhaustive security audit of PostgreSQL role metadata, privileges, and object ownership reveals a critical operational vulnerability: **the complete absence of application-specific database roles**. Currently, all database objects (tables, views, indexes, custom functions) are owned exclusively by `postgres` (the cluster superuser), and no dedicated application runtime role (`movana_app`), reporting role (`movana_readonly`), migration role (`movana_migration`), or schema owner role (`movana_owner`) exists. As a consequence, runtime application connections, data ingestion scripts, seed loaders, and migrations all rely on the superuser account `postgres`.

This Phase 3 architectural specification documents the current catalog state, quantifies least-privilege security gaps, establishes a comprehensive four-role access model, provides a least-privilege grant matrix, and details a safe, zero-downtime implementation roadmap and rollback design.

---

## 2. Current Role Inventory

Inspection of `pg_roles` on the PostgreSQL 16.13 cluster confirms that zero Movana-specific roles exist:

| Role Name | Login | Superuser | CreateDB | CreateRole | Replication | BypassRLS | Conn Limit | Password Set | Inherit |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `postgres` | **YES** | **YES** | **YES** | **YES** | **YES** | **YES** | -1 | YES | YES |
| `maritime_user` | YES | NO | YES | NO | NO | NO | -1 | YES | YES |
| `pg_checkpoint` | NO | NO | NO | NO | NO | NO | -1 | YES | YES |
| `pg_create_subscription`| NO | NO | NO | NO | NO | NO | -1 | YES | YES |
| `pg_database_owner` | NO | NO | NO | NO | NO | NO | -1 | YES | YES |
| `pg_execute_server_program`| NO | NO | NO | NO | NO | NO | -1 | YES | YES |
| `pg_monitor` | NO | NO | NO | NO | NO | NO | -1 | YES | YES |
| `pg_read_all_data` | NO | NO | NO | NO | NO | NO | -1 | YES | YES |
| `pg_read_all_settings` | NO | NO | NO | NO | NO | NO | -1 | YES | YES |
| `pg_read_all_stats` | NO | NO | NO | NO | NO | NO | -1 | YES | YES |
| `pg_read_server_files` | NO | NO | NO | NO | NO | NO | -1 | YES | YES |
| `pg_signal_backend` | NO | NO | NO | NO | NO | NO | -1 | YES | YES |
| `pg_stat_scan_tables` | NO | NO | NO | NO | NO | NO | -1 | YES | YES |
| `pg_use_reserved_connections`| NO | NO | NO | NO | NO | NO | -1 | YES | YES |
| `pg_write_all_data` | NO | NO | NO | NO | NO | NO | -1 | YES | YES |
| `pg_write_server_files` | NO | NO | NO | NO | NO | NO | -1 | YES | YES |

*Key Takeaway:* No application-tier or migration-tier service accounts exist. The database is entirely dependent on `postgres`.

---

## 3. Current Database Ownership

Catalog queries against `pg_database`, `pg_namespace`, `pg_class`, and `pg_proc` show the following ownership distribution:

| Object Category | Total Count | Owner | % Owned by Role | Notes |
| :--- | :---: | :---: | :---: | :--- |
| **Database `movana`** | 1 | `postgres` | 100% | Cluster administrator |
| **Schema `public`** | 1 | `pg_database_owner`| 100% | PostgreSQL 15+ standard pseudo-role |
| **Schema `information_schema`** | 1 | `postgres` | 100% | System catalog |
| **Schema `pg_catalog`** | 1 | `postgres` | 100% | System catalog |
| **Ordinary Tables (`r`)** | 112 | `postgres` | 100% | All business & domain tables |
| **Partitioned Tables (`p`)** | 1 | `postgres` | 100% | `vehicle_location_history` |
| **Views (`v`)** | 8 | `postgres` | 100% | Reporting & operational views |
| **Ordinary Indexes (`i`)** | 341 | `postgres` | 100% | Primary, foreign, and unique indexes |
| **Partitioned Indexes (`I`)** | 4 | `postgres` | 100% | Partition parent indexes |
| **Sequences (`S`)** | 0 | — | — | Tables use deterministic UUIDs / integer sequences |
| **Custom Functions** | 7 | `postgres` | 100% | Hardened in V025 |
| **Extension Functions** | 271 | `postgres` | 100% | `btree_gist` (188), `citext` (47), `pgcrypto` (36) |
| **Extensions** | 4 | `postgres` | 100% | `btree_gist`, `citext`, `pgcrypto`, `plpgsql` |

---

## 4. Database & Schema Privileges

### 4.1 Database Privileges (`movana`)
- `pg_database.datacl`: `NULL` (PostgreSQL default privileges apply).
- `PUBLIC` pseudo-role has:
  - `CONNECT`: **TRUE** (Any authenticated cluster user can connect to `movana`).
  - `TEMPORARY`: **TRUE** (Any connected user can create temporary tables).
  - `CREATE`: **FALSE** (Unprivileged users cannot create schemas in `movana`).

### 4.2 Schema Privileges (`public`)
- `pg_namespace.nspacl`: `{pg_database_owner=UC/pg_database_owner,=U/pg_database_owner}`.
- `pg_database_owner`: Has `USAGE` (`U`) and `CREATE` (`C`).
- `PUBLIC` pseudo-role has:
  - `USAGE`: **TRUE** (Can look up objects in `public`).
  - `CREATE`: **FALSE** (PostgreSQL 15+ default; `PUBLIC` cannot create new tables or functions in `public`).

---

## 5. Table Privileges

Audit of `information_schema.role_table_grants` and `pg_class.relacl`:
- **Active Table Grants:** All 121 relations (113 tables + 8 views) grant `SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER` solely to `postgres`.
- **`pg_class.relacl` Status:** `NULL` across all 121 relations (default owner-only access).
- **`PUBLIC` Table Privileges:**
  - `has_table_privilege('public', 'users', 'SELECT')` $\rightarrow$ **FALSE**.
  - `has_table_privilege('public', 'bookings', 'SELECT')` $\rightarrow$ **FALSE**.
  - `has_table_privilege('public', 'payments', 'SELECT')` $\rightarrow$ **FALSE**.
- **Assessment:** Application tables are protected against anonymous `PUBLIC` access. However, because no runtime application role exists, any client accessing these tables must authenticate as `postgres`.

---

## 6. View Privileges

Audit of all 8 Movana operational and analytics views:
1. `vw_active_vehicle_locations`
2. `vw_available_trip_seats`
3. `vw_booking_summary`
4. `vw_driver_trip_summary`
5. `vw_payment_summary`
6. `vw_route_schedule_summary`
7. `vw_trip_current_status`
8. `vw_vehicle_health_summary`

- **Owner:** `postgres` (100%).
- **`PUBLIC` Access:** Strictly `FALSE` on all views.
- **Sensitive Data Exposure Analysis:**
  - `vw_booking_summary`: Joins `bookings`, `booking_passengers`, and `users`, exposing passenger names, phone numbers, and email addresses.
  - `vw_driver_trip_summary`: Exposes driver employee codes, license numbers, phone numbers, and safety event counts.
  - `vw_payment_summary`: Exposes financial transaction amounts, payment references, and payment method identifiers.
  - *Recommendation:* Access to these views must be restricted to authenticated application roles (`movana_app`) and authorized analytics roles (`movana_readonly`).

---

## 7. Function and Procedure Privileges

Catalog query against `pg_proc` for custom routines:
- **Total Functions in `public`:** 278 (7 custom application functions + 271 extension functions).
- **Function Ownership:** 100% owned by `postgres`.
- **Security Definer Status:** Exactly **0** `SECURITY DEFINER` functions exist in `movana`. All routines are `SECURITY INVOKER` (`prosecdef = false`).
- **search_path Configuration:** All 7 custom application functions have `search_path = public, pg_temp` explicitly pinned in `proconfig` (verified post-V025):
  - `fn_calculate_trip_available_seats(uuid)`
  - `fn_generate_booking_reference()`
  - `fn_generate_invoice_number()`
  - `fn_log_booking_status_transition()`
  - `fn_log_trip_status_transition()`
  - `fn_record_audit_log()`
  - `fn_set_updated_at()`
- **`PUBLIC` Execute Privileges:**
  - `has_function_privilege('public', ..., 'EXECUTE')` is **TRUE** for all 7 application functions and all extension routines.
  - In PostgreSQL, functions are granted `EXECUTE` to `PUBLIC` by default.
  - *Finding:* Because functions are `SECURITY INVOKER`, executing them executes under the privileges of the calling user. However, sequence-generator functions (`fn_generate_booking_reference`, `fn_generate_invoice_number`) should not be callable by arbitrary unprivileged database users.

---

## 8. Default Privileges (`pg_default_acl`)

- **Current State:** `pg_default_acl` contains **0 rows**.
- **Impact:** No automated privilege inheritance exists for newly created objects.
- **Vulnerability:** When a future migration (`V026+`) creates a new table or view, `movana_app` and `movana_readonly` will receive **zero privileges** on the new object by default, causing immediate runtime `permission denied` application failures unless `ALTER DEFAULT PRIVILEGES` is explicitly configured.

---

## 9. Role Memberships

- **Current State:** `pg_auth_members` contains only system monitoring memberships (`pg_monitor` $\rightarrow$ `pg_read_all_settings`, `pg_read_all_stats`, `pg_stat_scan_tables`).
- **Zero Application Memberships:** No user or service account inherits privileges from any role.

---

## 10. Row Level Security (RLS) Status

Inspection of `pg_class.relrowsecurity` and `pg_policy`:
- **Tables with RLS Enabled:** **0** of 113 tables.
- **Configured RLS Policies:** **0**.
- **Architectural RLS Assessment:**

| Classification | Tables Included | Justification |
| :--- | :--- | :--- |
| **Category A: RLS Clearly Useful** | `passenger_profiles`, `user_addresses`, `emergency_contacts`, `user_preferences`, `notification_preferences`, `bookings`, `booking_passengers`, `booking_seats`, `payment_methods`, `payment_transactions`, `payments`, `refunds`, `support_tickets`, `user_sessions`, `password_reset_tokens`, `email_verification_tokens` | High-value PII, credential tokens, and financial records. Useful if multi-tenant or direct per-user session connections (`SET LOCAL app.current_user_id`) are adopted. |
| **Category B: RLS Potentially Useful** | `driver_documents`, `driver_availability`, `driver_safety_events`, `driver_status_history`, `reviews`, `incident_reports`, `incidents`, `lost_found_items`, `tracking_events`, `vehicle_location_history` | Sensitive driver/operational telemetry. Useful if drivers or external dispatchers connect with restricted credentials. |
| **Category C: RLS Unnecessary** | `routes`, `stops`, `route_stops`, `schedules_calendars`, `service_calendars`, `trip_schedules`, `seat_layouts`, `seats`, `fare_products`, `fare_rules`, `trip_fares`, `vehicles`, `system_settings`, `feature_flags`, `schema_migrations` | Shared reference catalogs, network topology, and configuration metadata. RLS would introduce unnecessary query planning overhead. |

*Recommendation:* Do NOT enable RLS blindly. The application currently implements authorization in the application middleware layer. RLS should only be implemented if the application architecture is designed to set session context parameters on pooled connections.

---

## 11. Security-Definer & search_path Review

- **Security Definer Count:** 0.
- **Search Path Findings:**
  - All 7 custom application functions have `search_path=public, pg_temp` explicitly set.
  - Zero functions run with escalated owner privileges.
  - Privilege escalation risk via function execution is currently **LOW**.
  - Proposed policy: Any future `SECURITY DEFINER` function must explicitly pin `search_path = public, pg_temp` and have `EXECUTE` revoked from `PUBLIC`.

---

## 12. PUBLIC Privilege Findings

Comprehensive evaluation of all permissions granted to `PUBLIC`:

| Privilege | Object | Current State | Risk Classification | Architectural Recommendation |
| :--- | :--- | :---: | :---: | :--- |
| `CONNECT` | Database `movana` | Granted | **SHOULD REMOVE LATER** | `REVOKE CONNECT ON DATABASE movana FROM PUBLIC;`. Explicitly grant `CONNECT` only to `movana_owner`, `movana_app`, `movana_readonly`, and `movana_migration`. |
| `TEMPORARY` | Database `movana` | Granted | **SHOULD REMOVE LATER** | `REVOKE TEMPORARY ON DATABASE movana FROM PUBLIC;`. Grant only to `movana_app` and `movana_owner`. |
| `USAGE` | Schema `public` | Granted | **SHOULD REVIEW** | Can remain acceptable if `CONNECT` is restricted, but revoking from `PUBLIC` and granting explicitly to Movana roles represents a cleaner zero-trust baseline. |
| `CREATE` | Schema `public` | Revoked | **ACCEPTABLE** | Already hardened by PostgreSQL 16 defaults. |
| `EXECUTE` | Custom Functions | Granted | **SHOULD REMOVE LATER** | `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;`. Configure default privilege to prevent auto-granting to `PUBLIC`. |
| `SELECT/DML` | Tables & Views | Revoked | **REQUIRED** | Already strictly zero. |

---

## 13. Sensitive Data Access Review

17 high-sensitivity tables audited:
- `users`, `passenger_profiles`, `user_addresses`, `emergency_contacts`, `driver_emergency_contacts`
- `password_reset_tokens`, `email_verification_tokens`, `user_sessions`, `security_events`, `audit_logs`
- `payment_methods`, `payment_transactions`, `payments`, `refunds`
- `file_attachments`, `tracking_events`, `vehicle_location_history`

**Access Requirements by Role:**
- `movana_app`: Requires full CRUD on operational records; `INSERT`-only on audit/security logs; no `TRUNCATE`.
- `movana_readonly`: Requires `SELECT` on business data; **EXCLUDE** access to authentication tokens (`password_reset_tokens`, `email_verification_tokens`, `user_sessions`) and password hashes in `users` (provide a sanitized view instead).
- `movana_migration`: Full DDL and schema access.
- `movana_owner`: Full administrative ownership.

---

## 14. Proposed Movana Four-Role Architecture

```
                  +-------------------------+
                  |        postgres         | (Cluster Superuser)
                  +-------------------------+
                               |
                   +-----------+-----------+
                   |                       |
                   v                       v
      +-------------------------+  +-------------------------+
      |      movana_owner       |  |    movana_migration     |
      |   (NOLOGIN Schema Owner)|  | (LOGIN Deployer / CI/CD)|
      +-------------------------+  +-------------------------+
                   ^                       |
                   | (GRANT movana_owner)  |
                   +-----------------------+
                               |
         +---------------------+---------------------+
         |                                           |
         v                                           v
+-------------------------+                 +-------------------------+
|       movana_app        |                 |     movana_readonly     |
| (LOGIN Runtime Backend) |                 | (LOGIN BI / Analytics)  |
+-------------------------+                 +-------------------------+
```

### Role Specifications

#### 1. `movana_owner`
- **Type:** NOLOGIN (Group/Owner Role)
- **Superuser:** NO | **CreateDB:** NO | **CreateRole:** NO | **Replication:** NO | **BypassRLS:** NO
- **Purpose:** Owns all application tables, views, custom functions, types, and domains in schema `public`.
- **Privileges:** `ALL PRIVILEGES` on database `movana` and schema `public`.

#### 2. `movana_app`
- **Type:** LOGIN (Service Account for Backend API / Workers)
- **Superuser:** NO | **CreateDB:** NO | **CreateRole:** NO | **Replication:** NO | **BypassRLS:** NO
- **Connection Limit:** Configurable (e.g. 100)
- **Purpose:** Handles operational OLTP workload.
- **Privileges:**
  - `CONNECT`, `TEMPORARY` on database `movana`.
  - `USAGE` on schema `public` (NO `CREATE`).
  - `SELECT, INSERT, UPDATE, DELETE` on operational tables (NO `TRUNCATE`).
  - `SELECT` on views.
  - `EXECUTE` on application utility functions.

#### 3. `movana_readonly`
- **Type:** LOGIN (Analytics, BI Dashboards, Support Auditing)
- **Superuser:** NO | **CreateDB:** NO | **CreateRole:** NO | **Replication:** NO | **BypassRLS:** NO
- **Connection Limit:** Configurable (e.g. 20)
- **Purpose:** Read-only queries, data warehousing extract, reporting.
- **Privileges:**
  - `CONNECT` on database `movana`.
  - `USAGE` on schema `public`.
  - `SELECT` on non-secret business tables and reporting views.
  - Explicitly denied access to authentication tokens.

#### 4. `movana_migration`
- **Type:** LOGIN (CI/CD Deployment & Migration Runner Account)
- **Superuser:** NO | **CreateDB:** NO | **CreateRole:** NO | **Replication:** NO | **BypassRLS:** NO
- **Role Membership:** `GRANT movana_owner TO movana_migration;`
- **Purpose:** Runs `migrate-movana.ps1` and executes DDL scripts (`V026+`) under `SET ROLE movana_owner;`.
- **Privileges:** Full DDL execution, schema migration tracking in `schema_migrations`.

---

## 15. Proposed Privilege Matrix

| Object Category | Privilege Type | `movana_owner` | `movana_app` | `movana_readonly` | `movana_migration` (via `movana_owner`) |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Database `movana`** | `CONNECT` | YES | YES | YES | YES |
| | `CREATE` | NO | NO | NO | NO |
| | `TEMPORARY` | YES | YES | NO | YES |
| **Schema `public`** | `USAGE` | YES | YES | YES | YES |
| | `CREATE` | YES | NO | NO | YES |
| **Operational Tables** | `SELECT` | YES | YES | YES | YES |
| | `INSERT` | YES | YES | NO | YES |
| | `UPDATE` | YES | YES | NO | YES |
| | `DELETE` | YES | YES | NO | YES |
| | `TRUNCATE` | YES | NO | NO | YES |
| | `REFERENCES` | YES | NO | NO | YES |
| | `TRIGGER` | YES | NO | NO | YES |
| **Token Tables (`*_tokens`)** | `SELECT` | YES | YES | **NO** | YES |
| | `INSERT/UPDATE/DELETE`| YES | YES | **NO** | YES |
| **Audit Logs (`audit_logs`)** | `SELECT` | YES | YES | YES | YES |
| | `INSERT` | YES | YES | NO | YES |
| | `UPDATE/DELETE` | YES | **NO** | **NO** | YES |
| **Sequences (if added)** | `USAGE` | YES | YES | NO | YES |
| | `SELECT` | YES | YES | YES | YES |
| **Custom Functions** | `EXECUTE` | YES | YES | Read-only Helpers | YES |
| **Views** | `SELECT` | YES | YES | YES | YES |

---

## 16. Application Role Analysis

Transitioning the runtime backend to `movana_app` establishes:
1. **Immunity from Privilege Escalation:** Compromise of application credentials does not grant `SUPERUSER`, eliminating risks of arbitrary OS command execution (`pg_execute_server_program`) or arbitrary filesystem reads (`pg_read_server_files`).
2. **DDL Prevention:** Application connections cannot accidentally or maliciously issue `DROP TABLE`, `ALTER TABLE`, or `TRUNCATE`.
3. **Audit Immutability:** Runtime application connections can insert into `audit_logs` and `security_events`, but cannot update or delete existing audit rows.
4. **Connection Pool Management:** Connection limits can be placed on `movana_app` to prevent runaway connection exhaustion against the PostgreSQL server.

---

## 17. Migration Role Analysis

The migration runner account `movana_migration`:
1. Executes migrations without requiring `postgres` superuser access.
2. Inherits ownership capabilities by executing `SET ROLE movana_owner;` at the start of each migration file.
3. Automatically assigns ownership of all newly created tables, indexes, constraints, views, and functions to `movana_owner`.
4. Eliminates fragmented object ownership across different deployment engineers.

---

## 18. Ownership Migration Analysis

### Current State
100% of tables, views, indexes, custom functions, and types in `public` are owned by `postgres`.

### Target State
All application objects owned by `movana_owner`. Extensions remain owned by `postgres`.

### Feasibility & Risk Analysis
- **Tables, Views, Custom Functions:** Can be safely reassigned via:
  ```sql
  REASSIGN OWNED BY postgres TO movana_owner;
  ```
  *(Filtered to database `movana` objects, excluding system extensions).*
- **Extensions (`btree_gist`, `citext`, `pgcrypto`, `plpgsql`):** Must remain owned by `postgres`. Extensions require superuser privileges to install and drop C-language functions.
- **Partitioned Table & Child Partitions:** All 8 partitions of `vehicle_location_history` must be reassigned concurrently to prevent catalog ownership divergence.
- **Execution Window:** Ownership reassignment acquires an exclusive lock on each object. Must be executed in a dedicated maintenance window.

---

## 19. Prioritized Least-Privilege Gaps

| Finding ID | Severity | Object / Scope | Current Catalog State | Inherent Security Risk | Proposed Remediation | Migration | Downtime |
| :--- | :---: | :--- | :--- | :--- | :--- | :---: | :---: |
| **GAP-01** | **CRITICAL** | Cluster / Database | Zero Movana roles exist; all access uses `postgres`. | Full superuser compromise if application connection string is leaked or exploited via SQL injection. | Provision `movana_owner`, `movana_app`, `movana_readonly`, `movana_migration`. Update backend configurations. | Yes | None (Rolling) |
| **GAP-02** | **HIGH** | Database `movana` | `PUBLIC` has `CONNECT` and `TEMPORARY` on database. | Any authenticated user on the cluster (e.g. `maritime_user`) can connect and consume disk temp space. | `REVOKE CONNECT, TEMPORARY ON DATABASE movana FROM PUBLIC;`. Grant explicitly to Movana roles. | Yes | None |
| **GAP-03** | **MEDIUM** | Schema `public` | `pg_default_acl` is empty (0 rows). | New tables created by future migrations will have 0 privileges for `movana_app`, breaking the app. | Configure `ALTER DEFAULT PRIVILEGES FOR ROLE movana_owner ...` for tables, sequences, functions. | Yes | None |
| **GAP-04** | **MEDIUM** | Functions in `public` | All 7 custom functions grant `EXECUTE` to `PUBLIC`. | Any connected user can call number-generation routines (`fn_generate_booking_reference`, `fn_generate_invoice_number`). | `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;`. Grant only to `movana_app` and `movana_readonly`. | Yes | None |
| **GAP-05** | **LOW** | 121 Relations / Functions | Domain objects 100% owned by `postgres`. | Operational management requires superuser; violates separation of duties. | `REASSIGN OWNED BY postgres TO movana_owner;` (excluding extensions). | Yes | Brief (Locks) |
| **GAP-06** | **INFO** | Sensitive Tables | Zero Row Level Security enabled. | Authorization relies 100% on application middleware filters. | Maintain app-level filtering; design RLS policies in a future phase if direct multi-tenant DB access is needed. | Future | None |

---

## 20. Application Impact Analysis

Switching backend services from `postgres` to `movana_app`:
1. **Connection String Update:** `DATABASE_URL` or `DB_USER` in `.env` / Kubernetes secrets changes from `postgres` to `movana_app`.
2. **Disallowed Operations:**
   - Application cannot execute `CREATE TABLE`, `ALTER TABLE`, `DROP TABLE`. ORMs configured with auto-sync must disable it in production.
   - Application cannot execute `TRUNCATE`. Backend code calling `.truncate()` must be refactored to `.delete()`.
3. **Triggers and Sequences:**
   - Triggers execute within the table's context; existing triggers (`fn_set_updated_at`, status loggers) continue to function identically.
4. **Performance Impact:** Zero runtime overhead. Privilege verification is cached by PostgreSQL per connection.

---

## 21. Phase 3 Implementation Roadmap (Design Only)

```
[Phase 3A: Audit & Architecture Design] <--- COMPLETED IN THIS TASK
                   |
[Phase 3B: Role Provisioning Script] (Idempotent script scripts/database/provision-roles.ps1)
                   |
[Phase 3C: Migration V026__database_roles_and_privileges.sql]
  - Revoke CONNECT, TEMPORARY on database from PUBLIC
  - Grant CONNECT, TEMPORARY to movana_owner, movana_app, movana_readonly, movana_migration
  - Revoke USAGE on schema public from PUBLIC
  - Grant USAGE to movana_app, movana_readonly; USAGE, CREATE to movana_owner
  - Grant Table/View CRUD to movana_app; SELECT to movana_readonly
  - Revoke EXECUTE on functions from PUBLIC; Grant to movana_app
  - Configure ALTER DEFAULT PRIVILEGES
                   |
[Phase 3D: Migration V027__database_ownership.sql]
  - Reassign domain object ownership from postgres to movana_owner
                   |
[Phase 3E: Application Switchover & Verification]
  - Update backend credentials to movana_app
  - Verify migration runner with movana_migration
  - Execute database integrity suite
```

---

## 22. Rollback Design

If any issue arises during or after Phase 3 implementation, the following rollback sequence can be executed by `postgres`:

```sql
-- 1. Switch application configuration back to postgres
-- 2. Revert object ownership to postgres
REASSIGN OWNED BY movana_owner TO postgres;

-- 3. Restore default PUBLIC privileges
GRANT CONNECT, TEMPORARY ON DATABASE movana TO PUBLIC;
GRANT USAGE ON SCHEMA public TO PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO PUBLIC;

-- 4. Revoke and drop created roles
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM movana_app, movana_readonly;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM movana_app, movana_readonly;
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM movana_app, movana_readonly;
REVOKE ALL PRIVILEGES ON SCHEMA public FROM movana_app, movana_readonly, movana_owner, movana_migration;
REVOKE ALL PRIVILEGES ON DATABASE movana FROM movana_app, movana_readonly, movana_owner, movana_migration;

DROP ROLE IF EXISTS movana_app;
DROP ROLE IF EXISTS movana_readonly;
DROP ROLE IF EXISTS movana_migration;
DROP ROLE IF EXISTS movana_owner;
```

---

## 23. Migration Strategy Recommendation

- **Role Creation (Cluster Level):** In PostgreSQL, `CREATE ROLE` is a cluster-level global command that does not belong inside transaction-scoped, version-controlled schema migrations because credentials vary by environment (development, staging, production).
  - *Recommendation:* Create an idempotent role provisioning script: `scripts/database/provision-roles.ps1`.
- **Privilege & Ownership Migrations (Database Level):**
  - `V026__database_privileges.sql`: Configures database, schema, table, view, function grants, and `ALTER DEFAULT PRIVILEGES`.
  - `V027__database_ownership.sql`: Reassigns domain object ownership to `movana_owner`.

---

## 24. Final Recommendation & Safety Confirmation

The proposed four-role architecture provides a robust, defense-in-depth security model adhering to CIS PostgreSQL benchmarks and enterprise least-privilege standards.

```text
PHASE 3 AUDIT STATUS: COMPLETE
LIVE DATABASE MODIFIED: NO
ROLES CREATED: NO
PRIVILEGES CHANGED: NO
OWNERSHIP CHANGED: NO
PASSWORDS CREATED/CHANGED: NO
SCHEMA MODIFIED: NO
MIGRATION EXECUTED: NO
V026 CREATED: NO
FINAL DESIGN STATUS: READY FOR IMPLEMENTATION
```
