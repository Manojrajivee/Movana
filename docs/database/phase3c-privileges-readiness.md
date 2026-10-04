# Movana Database Phase 3C — Privileges & Default ACLs Readiness Audit Report

**Date:** 2026-10-01  
**Target Database:** `movana` (PostgreSQL 16.13, localhost:5432)  
**Audit Status:** STRICTLY READ-ONLY PRE-IMPLEMENTATION SAFETY AUDIT  
**Live Database Modifications:** NONE (Zero privileges granted or revoked; live state 100% unmodified)  
**Authoritative References:**
- `docs/database/phase3-roles-permissions-design.md`
- `docs/database/phase3-privilege-matrix.csv`
- `docs/database/phase3b-role-provisioning-execution.md`

---

## 1. Executive Summary

Following the successful provisioning of the four Movana database roles (`movana_owner`, `movana_app`, `movana_readonly`, `movana_migration`) in Phase 3B, this Phase 3C readiness audit evaluates the exact privilege state of database `movana`, schema `public`, all 113 base tables, 8 views, 278 functions, and default ACLs.

All catalog inspections were executed in strictly read-only mode. The catalog audit confirms that:
- The Phase 3B baseline is fully intact (all four roles exist with correct attributes; exactly one membership `movana_migration -> movana_owner`).
- All 113 tables and 8 views currently have `relacl = NULL` (default owner-only access for `postgres`).
- `PUBLIC` holds default `CONNECT` and `TEMPORARY` on database `movana`, and default `USAGE` on schema `public`.
- Exactly 0 default privileges are configured in `pg_default_acl`.
- 100% of routines in `public` are `SECURITY INVOKER` (0 `SECURITY DEFINER` functions).
- 0 tables have Row Level Security enabled.
- 0 sequences exist in the database.

Readiness Decision: **`APPROVED WITH CONDITIONS`**  
*(Approved subject to four critical implementation conditions: extension function execute preservation, audit log append-only immutability, token table isolation from readonly roles, and proper default privilege attribution to `movana_owner`).*

---

## 2. Current Role Baseline Verification

Catalog query against `pg_roles` and `pg_auth_members`:

```sql
SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolinherit, rolreplication, rolbypassrls 
FROM pg_roles 
WHERE rolname IN ('movana_owner', 'movana_app', 'movana_readonly', 'movana_migration');
```

| Role Name | Login | Superuser | CreateDB | CreateRole | Inherit | Replication | BypassRLS | Confirmed Attributes |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **`movana_owner`** | `f` | `f` | `f` | `f` | `f` | `f` | `f` | **VERIFIED (NOLOGIN Owner)** |
| **`movana_app`** | `t` | `f` | `f` | `f` | `t` | `f` | `f` | **VERIFIED (LOGIN Runtime)** |
| **`movana_readonly`** | `t` | `f` | `f` | `f` | `t` | `f` | `f` | **VERIFIED (LOGIN Analytics)**|
| **`movana_migration`**| `t` | `f` | `f` | `f` | `t` | `f` | `f` | **VERIFIED (LOGIN Deployer)** |

### Role Membership Status
```sql
SELECT r_role.rolname, r_member.rolname FROM pg_auth_members ...
```
- **Active Membership:** Exactly one: `movana_migration -> movana_owner` (`admin_option: false`, `inherit_option: true`).
- **Isolation:** `movana_app` and `movana_readonly` hold **zero** memberships in `movana_owner` or each other.

---

## 3. Database Privilege Audit (`movana`)

Live query against `pg_database`:

| Role | `CONNECT` Privilege | `TEMPORARY` Privilege | `CREATE` Privilege | Privilege Source |
| :--- | :---: | :---: | :---: | :--- |
| **`PUBLIC`** | **`true`** | **`true`** | `false` | PostgreSQL default ACL |
| **`movana_owner`** | `true` | `true` | `false` | Inherited from `PUBLIC` |
| **`movana_app`** | `true` | `true` | `false` | Inherited from `PUBLIC` |
| **`movana_readonly`** | `true` | `true` | `false` | Inherited from `PUBLIC` |
| **`movana_migration`**| `true` | `true` | `false` | Inherited from `PUBLIC` |
| **`postgres`** | `true` | `true` | `true` | Database DBA / Superuser |

### Public Database Access & Cluster Isolation Findings
- `PUBLIC CONNECT` and `PUBLIC TEMPORARY` are currently enabled on `movana`.
- On this cluster, an unrelated role exists: `maritime_user`.
- Because `maritime_user` currently connects via `PUBLIC`, executing `REVOKE CONNECT ON DATABASE movana FROM PUBLIC;` will immediately prevent `maritime_user` from establishing sessions against `movana`.
- **Recommendation:** Revoking `PUBLIC CONNECT` and `TEMPORARY` is **STRONGLY RECOMMENDED**. Explicit `GRANT CONNECT` must be provided to the four Movana roles prior to or concurrently with the revoke.

---

## 4. Schema Privilege Audit (`public`)

Live query against `pg_namespace.nspacl`:
- `nspacl`: `{pg_database_owner=UC/pg_database_owner,=U/pg_database_owner}`.

| Role | `USAGE` Privilege | `CREATE` Privilege | Privilege Source | Target Phase 3C State |
| :--- | :---: | :---: | :--- | :--- |
| **`PUBLIC`** | `true` | `false` | Default PostgreSQL 16 ACL | Revoke `USAGE` (or restrict) |
| **`movana_owner`** | `true` | `false` | Inherited from `PUBLIC` | Explicit `GRANT USAGE, CREATE` |
| **`movana_migration`**| `true` | `false` | Inherited from `PUBLIC` | Explicit `GRANT USAGE, CREATE` |
| **`movana_app`** | `true` | `false` | Inherited from `PUBLIC` | Explicit `GRANT USAGE` (NO `CREATE`) |
| **`movana_readonly`** | `true` | `false` | Inherited from `PUBLIC` | Explicit `GRANT USAGE` (NO `CREATE`) |
| **`postgres`** | `true` | `true` | Superuser | Retain |

---

## 5. Table & View ACL Audit

Inspection of all 121 relations (113 base tables + 8 views):
- **Catalog Status:** `relacl IS NULL` for 100% of relations (121 of 121).
- **Access:** Currently accessible only to the object owner (`postgres`).
- **`PUBLIC` Table Access:** Verified `false` across all relations.
- **Finding:** No application or reporting role currently has permission to query any table or view. Phase 3C is required before backend switchover.

---

## 6. Dynamic Table Classification & Least-Privilege Rules

All 113 base tables and 8 views were dynamically audited and classified:

### Category A: Runtime Operational Tables (78 tables)
*Core OLTP tables requiring standard application backend CRUD.*
- **Tables:** `bookings`, `booking_items`, `booking_passengers`, `booking_seats`, `booking_status_history`, `booking_cancellations`, `booking_reschedules`, `trips`, `trip_assignments`, `trip_stops`, `trip_status_history`, `trip_events`, `geofences`, `geofence_events`, `drivers`, `driver_documents`, `driver_assignments`, `driver_availability`, `driver_status_history`, `driver_safety_events`, `vehicles`, `vehicle_documents`, `vehicle_assignments`, `vehicle_status_history`, `vehicle_inspections`, `vehicle_inspection_items`, `vehicle_inspection_issues`, `maintenance_records`, `maintenance_items`, `tracking_devices`, `tracking_events`, `vehicle_location_history` (and all 8 partitions), `payments`, `payment_attempts`, `payment_events`, `payment_transactions`, `refunds`, `refund_transactions`, `invoices`, `invoice_items`, `notifications`, `notification_deliveries`, `notification_templates`, `notification_preferences`, `incidents`, `incident_reports`, `incident_actions`, `support_tickets`, `support_ticket_messages`, `support_ticket_attachments`, `support_ticket_status_history`, `lost_found_reports`, `lost_found_items`, `lost_found_status_history`, `reviews`, `review_responses`, `file_attachments`, `users`, `passenger_profiles`, `user_addresses`, `user_preferences`, `user_roles`, `emergency_contacts`, `driver_emergency_contacts`, `emergency_events`.
- **`movana_app`:** `SELECT, INSERT, UPDATE, DELETE` (strictly **NO** `TRUNCATE`, `REFERENCES`, `TRIGGER`).
- **`movana_readonly`:** `SELECT` only.
- **`movana_migration`:** `ALL PRIVILEGES` (via `movana_owner`).

### Category B: Authentication & Security Sensitive (5 tables)
*High-value authentication tokens, customer gateway tokens, and background checks.*
- **Tables:** `password_reset_tokens`, `email_verification_tokens`, `user_sessions`, `payment_methods`, `driver_verifications`.
- **`movana_app`:** `SELECT, INSERT, UPDATE, DELETE`.
- **`movana_readonly`:** **`NO ACCESS`** (Strictly excluded to prevent token leakage to BI/analytics).

### Category C: Audit & Security Logging (3 tables)
*Append-only system security and change tracking.*
- **Tables:** `audit_logs`, `security_events`, `login_attempts`.
- **`movana_app`:** `SELECT, INSERT` (**NO** `UPDATE`, **NO** `DELETE`, **NO** `TRUNCATE`).
- **`movana_readonly`:** `SELECT` only.

### Category D: Reference & Configuration Catalogs (26 tables)
*Static reference data and system configuration.*
- **Tables:** `routes`, `stops`, `route_stops`, `route_versions`, `schedules_calendars`, `service_calendars`, `service_calendar_exceptions`, `trip_schedules`, `schedule_stops`, `seat_layouts`, `seats`, `fare_products`, `fare_rules`, `fare_prices`, `trip_fares`, `coupons`, `discounts`, `coupon_redemptions`, `vehicle_types`, `vehicle_manufacturers`, `vehicle_models`, `driver_document_types`, `incident_types`, `incident_severity_levels`, `review_categories`, `roles`, `permissions`, `role_permissions`, `system_settings`, `feature_flags`, `maintenance_schedules`, `maintenance_parts`.
- **`movana_app`:** `SELECT` (plus `INSERT, UPDATE` on dynamic operational configs like `coupon_redemptions`, `system_settings`).
- **`movana_readonly`:** `SELECT`.

### Category E: Reporting & Operational Views (8 views)
- **Views:** `vw_active_vehicle_locations`, `vw_available_trip_seats`, `vw_booking_summary`, `vw_driver_trip_summary`, `vw_payment_summary`, `vw_route_schedule_summary`, `vw_trip_current_status`, `vw_vehicle_health_summary`.
- **`movana_app`:** `SELECT`.
- **`movana_readonly`:** `SELECT`.

### Category F: Migration Ledger & Internal (1 table)
- **Table:** `schema_migrations`.
- **`movana_owner` & `movana_migration`:** `ALL PRIVILEGES`.
- **`movana_app` & `movana_readonly`:** **`NO ACCESS`**.

---

## 7. Sensitive Data & Privacy Review

| Sensitive Data Category | Table(s) | `movana_app` Access | `movana_readonly` Access | Justification |
| :--- | :--- | :---: | :---: | :--- |
| **Authentication Tokens** | `password_reset_tokens`, `email_verification_tokens`, `user_sessions` | CRUD | **NONE** | Reporting tools never require active session tokens or password reset hashes. |
| **Stored Payment Tokens** | `payment_methods` | CRUD | **NONE** | Protects gateway customer IDs and masked card references. |
| **Audit Logs** | `audit_logs`, `security_events`, `login_attempts` | `SELECT, INSERT` | `SELECT` | Immutability protection; prevents rogue app queries from altering history. |
| **User Identity & PII** | `users`, `passenger_profiles`, `emergency_contacts` | CRUD | `SELECT` (Sanitized) | Readonly role needs reporting on user volume, but `password_hash` in `users` must not be exposed. |
| **GPS Telemetry** | `vehicle_location_history` (all 8 parts), `tracking_events` | CRUD | `SELECT` | Fleet tracking analysis; no interference with declarative partitioning. |

---

## 8. View Execution Model & Security Analysis

Audit of all 8 views in `pg_class`:
- `reloptions` is `NULL` across all 8 views (PostgreSQL standard view execution).
- Under PostgreSQL default semantics, views run with the privileges of the view **owner** (`postgres` currently; `movana_owner` in Phase 3D).
- Querying users require `SELECT` on the view itself.
- Granting `SELECT` on all 8 views to `movana_app` and `movana_readonly` is technically sound, verified, and safe.

---

## 9. Function & Routine Privilege Analysis

Audit of 278 routines in `public`:
- **Extension Functions (271 routines):** `btree_gist` (188), `citext` (47), `pgcrypto` (36).
- **Custom Application Functions (7 routines):**
  1. `fn_calculate_trip_available_seats(uuid)`
  2. `fn_generate_booking_reference()`
  3. `fn_generate_invoice_number()`
  4. `fn_log_booking_status_transition()`
  5. `fn_log_trip_status_transition()`
  6. `fn_record_audit_log()`
  7. `fn_set_updated_at()`

> [!CRITICAL]
> **Extension Function Privilege Safeguard:**
> Do **NOT** execute blanket `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;`.
> In PostgreSQL, data type operators (such as `=` and `<>` on `citext`, or GiST index search operators) invoke underlying extension functions. Revoking `PUBLIC EXECUTE` on extension functions causes `permission denied for function citext_eq` when querying `citext` columns.
> **Implementation Mandate:**
> Revoke `EXECUTE` from `PUBLIC` **strictly on the 7 custom application functions**, while leaving extension routines accessible to all authenticated connections.

---

## 10. Sequence & Default Privileges (`pg_default_acl`)

- **Sequence Count:** Verified **0 sequences** in `pg_sequences`. Proactive default privilege configuration on sequences will be established for future migrations.
- **Current Default ACLs:** Verified **0 rows** in `pg_default_acl`.
- **Target Role for Default ACLs:**
  In PostgreSQL, `ALTER DEFAULT PRIVILEGES FOR ROLE <target_role>` configures defaults *only when `<target_role>` creates the object*.
  Because migrations execute under `SET ROLE movana_owner;`, default privileges **must be configured for role `movana_owner`**:
  ```sql
  ALTER DEFAULT PRIVILEGES FOR ROLE movana_owner IN SCHEMA public 
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO movana_app;
  ALTER DEFAULT PRIVILEGES FOR ROLE movana_owner IN SCHEMA public 
      GRANT SELECT ON TABLES TO movana_readonly;
  ```

---

## 11. Application & Migration Compatibility

- **Backend Runtime (`movana_app`):**
  The proposed grants give `movana_app` standard CRUD across all operational tables, view SELECT, and execution on application generator routines (`fn_generate_booking_reference`, `fn_generate_invoice_number`, `fn_calculate_trip_available_seats`). Triggers run in the table's context; foreign key checks pass because `movana_app` has `SELECT` on all referenced tables.
- **Migration Runner (`movana_migration`):**
  `movana_migration` is a member of `movana_owner`. Running migrations with `SET ROLE movana_owner;` gives it full schema creation, DDL, table alteration, and ledger update privileges without granting `movana_app` administrative powers.

---

## 12. Prioritized Risks & Gaps

| Finding ID | Severity | Object / Scope | Description | Mitigation |
| :--- | :---: | :--- | :--- | :--- |
| **GAP-01** | **CRITICAL** | Custom Functions | Blanket `REVOKE EXECUTE ON ALL FUNCTIONS` would break `citext` operators. | Revoke `EXECUTE` only on custom application functions. |
| **GAP-02** | **HIGH** | Database `movana` | `PUBLIC CONNECT` allows unauthorized cluster users (`maritime_user`) to connect. | Revoke `CONNECT` from `PUBLIC`; grant explicitly to Movana roles. |
| **GAP-03** | **HIGH** | Audit Tables | Blanket `UPDATE/DELETE` on tables would compromise audit trail immutability. | Explicitly revoke `UPDATE, DELETE, TRUNCATE` on audit tables from `movana_app`. |
| **GAP-04** | **MEDIUM** | Token Tables | Blanket `SELECT` on tables would expose authentication tokens to readonly users. | Explicitly revoke all access on Category B token tables from `movana_readonly`. |
| **GAP-05** | **MEDIUM** | Schema `public` | Default ACLs empty; new migration tables would be inaccessible to `movana_app`. | Configure `ALTER DEFAULT PRIVILEGES FOR ROLE movana_owner`. |

---

## 13. Exact Phase 3C Implementation Sequence

The implementation will be delivered via an idempotent script without manual SQL errors:

```text
3C-1:  GRANT CONNECT ON DATABASE movana TO movana_owner, movana_app, movana_readonly, movana_migration;
3C-2:  GRANT TEMPORARY ON DATABASE movana TO movana_owner, movana_app, movana_migration;
3C-3:  REVOKE TEMPORARY, CONNECT ON DATABASE movana FROM PUBLIC;
3C-4:  GRANT USAGE ON SCHEMA public TO movana_owner, movana_app, movana_readonly, movana_migration;
3C-5:  GRANT CREATE ON SCHEMA public TO movana_owner, movana_migration;
3C-6:  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO movana_app;
3C-7:  GRANT SELECT ON ALL TABLES IN SCHEMA public TO movana_readonly;
3C-8:  GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO movana_owner;
3C-9:  REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.audit_logs, public.security_events, public.login_attempts FROM movana_app, movana_readonly;
3C-10: REVOKE ALL ON TABLE public.password_reset_tokens, public.email_verification_tokens, public.user_sessions, public.payment_methods, public.driver_verifications FROM movana_readonly;
3C-11: REVOKE ALL ON TABLE public.schema_migrations FROM movana_app, movana_readonly;
3C-12: REVOKE EXECUTE ON FUNCTION public.fn_calculate_trip_available_seats(uuid), public.fn_generate_booking_reference(), public.fn_generate_invoice_number(), public.fn_log_booking_status_transition(), public.fn_log_trip_status_transition(), public.fn_record_audit_log(), public.fn_set_updated_at() FROM PUBLIC;
3C-13: GRANT EXECUTE ON FUNCTION public.fn_calculate_trip_available_seats(uuid), public.fn_generate_booking_reference(), public.fn_generate_invoice_number() TO movana_app;
3C-14: GRANT EXECUTE ON FUNCTION public.fn_calculate_trip_available_seats(uuid) TO movana_readonly;
3C-15: GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO movana_owner, movana_migration;
3C-16: Configure ALTER DEFAULT PRIVILEGES FOR ROLE movana_owner (TABLES, SEQUENCES, FUNCTIONS, TYPES);
3C-17: Configure ALTER DEFAULT PRIVILEGES FOR ROLE movana_migration (TABLES, SEQUENCES, FUNCTIONS, TYPES);
```

---

## 14. Phase 3C Rollback Plan

```sql
-- 1. Restore database permissions for PUBLIC
GRANT CONNECT, TEMPORARY ON DATABASE movana TO PUBLIC;

-- 2. Restore schema public permissions for PUBLIC
GRANT USAGE ON SCHEMA public TO PUBLIC;

-- 3. Restore EXECUTE on custom functions for PUBLIC
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO PUBLIC;

-- 4. Revoke default privileges
ALTER DEFAULT PRIVILEGES FOR ROLE movana_owner IN SCHEMA public REVOKE ALL ON TABLES FROM movana_app, movana_readonly;
ALTER DEFAULT PRIVILEGES FOR ROLE movana_owner IN SCHEMA public REVOKE ALL ON SEQUENCES FROM movana_app, movana_readonly;
ALTER DEFAULT PRIVILEGES FOR ROLE movana_owner IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM movana_app;
ALTER DEFAULT PRIVILEGES FOR ROLE movana_owner IN SCHEMA public REVOKE ALL ON TYPES FROM movana_app, movana_readonly;

ALTER DEFAULT PRIVILEGES FOR ROLE movana_migration IN SCHEMA public REVOKE ALL ON TABLES FROM movana_app, movana_readonly;
ALTER DEFAULT PRIVILEGES FOR ROLE movana_migration IN SCHEMA public REVOKE ALL ON SEQUENCES FROM movana_app, movana_readonly;
ALTER DEFAULT PRIVILEGES FOR ROLE movana_migration IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM movana_app;
ALTER DEFAULT PRIVILEGES FOR ROLE movana_migration IN SCHEMA public REVOKE ALL ON TYPES FROM movana_app, movana_readonly;

-- 5. Revoke all granted privileges from Movana roles
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM movana_app, movana_readonly, movana_owner, movana_migration;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM movana_app, movana_readonly, movana_owner, movana_migration;
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM movana_app, movana_readonly, movana_owner, movana_migration;
REVOKE ALL PRIVILEGES ON SCHEMA public FROM movana_app, movana_readonly, movana_owner, movana_migration;
REVOKE ALL PRIVILEGES ON DATABASE movana FROM movana_app, movana_readonly, movana_owner, movana_migration;
```

---

## 15. Final Readiness Decision

```text
PHASE 3C READINESS: APPROVED WITH CONDITIONS
```

**Conditions:**
1. Extension function `EXECUTE` privileges must remain granted to `PUBLIC` so that `citext` operators and GiST indexes continue to function without errors.
2. `audit_logs`, `security_events`, and `login_attempts` must be strictly configured as append-only (`SELECT, INSERT`) for `movana_app`.
3. Category B sensitive token tables must be completely isolated from `movana_readonly`.
4. `ALTER DEFAULT PRIVILEGES` must be assigned to role `movana_owner`.

---

## 16. Mandatory Final Safety Status

```text
============================================================
MOVANA PHASE 3C — PRIVILEGE READINESS AUDIT
============================================================

TARGET DATABASE: movana
DATABASE VERIFIED: YES

LIVE DATABASE MODIFIED: NO
ROLES CREATED: NO
ROLES ALTERED: NO
PRIVILEGES GRANTED: NO
PRIVILEGES REVOKED: NO
DEFAULT PRIVILEGES CHANGED: NO
OWNERSHIP CHANGED: NO
PASSWORDS CHANGED: NO
TABLES MODIFIED: NO
DATA MODIFIED: NO
FUNCTIONS MODIFIED: NO
VIEWS MODIFIED: NO
RLS MODIFIED: NO
MIGRATION EXECUTED: NO
V026 CREATED: NO
V027 CREATED: NO

PHASE 3C READINESS: APPROVED WITH CONDITIONS
============================================================
```
