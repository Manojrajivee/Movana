# V025 Final Pre-Execution Validation Report

**Target Database**: PostgreSQL 16.13 (`movana`)  
**Host / Port**: `localhost:5432`  
**Migration Target**: `database/migrations/V025__database_optimizations.sql`  
**Phase**: Pre-Execution Static Verification & Safety Audit  
**Execution Mode**: **STRICTLY READ-ONLY**  
**Live Database Modification**: **NO — 100% UNCHANGED** (Zero DDL, DML, or DCL executed)  
**Date**: September 30, 2026  
**Auditor**: Senior PostgreSQL Database Administrator & Infrastructure Architect  

---

## 1. Migration Numbering & Ledger Verification

The migration repository and ledger were audited to guarantee sequential integrity:

| Check | Expected | Actual Result | Status |
| :--- | :--- | :--- | :---: |
| **Existing Migration Range** | `V001` through `V024` | 24 applied records in `schema_migrations`, all `success = true` | **PASS** |
| **Next Sequence Number** | `V025` | `V025__database_optimizations.sql` | **PASS** |
| **File Uniqueness** | Exactly one `V025` file | Exactly one file: `database/migrations/V025__database_optimizations.sql` | **PASS** |
| **Description Match** | `database optimizations` | Matches filename: `V025__database_optimizations.sql` | **PASS** |
| **Subsequent Migrations** | None | No `V026` or later migration files exist | **PASS** |

---

## 2. Migration Statement-by-Statement Audit

Every statement in `V025__database_optimizations.sql` was statically parsed and classified in execution order:

| Stmt # | Statement Category | Target Object(s) | Operational Summary | Safety Verdict |
| :-: | :--- | :--- | :--- | :---: |
| **1** | `TRANSACTION_START` | Engine Session | `BEGIN;` — Initiates single atomic transaction. | **SAFE** |
| **2** | `PLPGSQL_BLOCK` | Session Context | Pre-condition: Asserts `current_database() = 'movana'`. Aborts if false. | **SAFE** |
| **3–23** | `CREATE INDEX` | 21 Tables | Creates 21 targeted B-tree indexes supporting critical FKs (`IF NOT EXISTS`). | **SAFE** |
| **24–44** | `COMMENT ON INDEX` | 21 Indexes | Metadata documentation on all 21 created indexes. | **SAFE** |
| **45–73** | `DROP INDEX` | 29 Tables | Drops 29 exact duplicate non-unique indexes (`IF EXISTS`). | **SAFE** |
| **74–82** | `DROP INDEX` | 9 Tables | Drops 9 safe leftmost-prefix redundant indexes (`IF EXISTS`). | **SAFE** |
| **83–89** | `ALTER FUNCTION` | 7 Functions | Sets `search_path = public, pg_temp` across all 7 Movana functions. | **SAFE** |
| **90** | `ALTER TABLE` | `vehicle_location_history` | `DETACH PARTITION vehicle_location_history_default;` | **SAFE** |
| **91–94** | `CREATE TABLE` | `vehicle_location_history` | Creates 4 monthly partitions (`y2026m12`, `y2027m01`, `y2027m02`, `y2027m03`). | **SAFE** |
| **95** | `CTE (DELETE + INSERT)` | Telemetry Tables | Relocates 100 December 2026 rows from detached default into parent table. | **SAFE** |
| **96** | `PLPGSQL_BLOCK` | Partition Verification | Asserts `count(*) = 0` in `vehicle_location_history_default`. | **SAFE** |
| **97** | `ALTER TABLE` | `vehicle_location_history` | `ATTACH PARTITION vehicle_location_history_default DEFAULT;` | **SAFE** |
| **98** | `PLPGSQL_BLOCK` | Total Verification | Asserts total rows = 1600 and `y2026m12` rows = 100. | **SAFE** |
| **99** | `TRANSACTION_COMMIT` | Engine Session | `COMMIT;` — Atomically commits all changes. | **SAFE** |

### Safety Invariants Confirmed:
* **Zero Unexpected Drops**: No `DROP TABLE`, `DROP DATABASE`, `DROP SCHEMA`, or `DROP ROLE` statements.
* **Zero Unbounded Modifications**: No `TRUNCATE` statements. The only `DELETE` is strictly bounded to `recorded_at >= '2026-12-01' AND recorded_at < '2027-01-01'` within an atomic `DELETE ... RETURNING` CTE that re-inserts every row into the parent table.
* **Database Isolation**: Contains zero references to external databases or clusters. Scoped exclusively to `movana`.

---

## 3. Foreign Key Index Validation (21 Proposed Indexes)

All 21 proposed indexes were statically validated against the live database catalog:
- **Table Existence**: 100% verified.
- **Column Existence**: 100% verified.
- **Column Ordering**: 100% verified against child foreign key columns.
- **Name Collisions**: Zero collisions against `pg_class`.
- **Pre-existing Coverage**: Zero existing equivalent indexes.

### Exact 21 `CREATE INDEX` Execution Statements:
```sql
CREATE INDEX IF NOT EXISTS idx_booking_seats_passenger_id ON public.booking_seats (passenger_id);
CREATE INDEX IF NOT EXISTS idx_booking_seats_seat_id ON public.booking_seats (seat_id);
CREATE INDEX IF NOT EXISTS idx_bookings_origin_stop_id ON public.bookings (origin_stop_id);
CREATE INDEX IF NOT EXISTS idx_bookings_destination_stop_id ON public.bookings (destination_stop_id);
CREATE INDEX IF NOT EXISTS idx_routes_destination_stop_id ON public.routes (destination_stop_id);
CREATE INDEX IF NOT EXISTS idx_schedule_stops_stop_id ON public.schedule_stops (stop_id);
CREATE INDEX IF NOT EXISTS idx_trips_schedule_id ON public.trips (schedule_id);
CREATE INDEX IF NOT EXISTS idx_trips_secondary_driver_id ON public.trips (secondary_driver_id);
CREATE INDEX IF NOT EXISTS idx_trips_current_stop_id ON public.trips (current_stop_id);
CREATE INDEX IF NOT EXISTS idx_driver_safety_events_trip_id ON public.driver_safety_events (trip_id);
CREATE INDEX IF NOT EXISTS idx_geofence_events_trip_id ON public.geofence_events (trip_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_assignments_trip_id ON public.vehicle_assignments (trip_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_inspections_trip_id ON public.vehicle_inspections (trip_id);
CREATE INDEX IF NOT EXISTS idx_fare_rules_route_id ON public.fare_rules (route_id);
CREATE INDEX IF NOT EXISTS idx_trip_fares_origin_stop_id ON public.trip_fares (origin_stop_id);
CREATE INDEX IF NOT EXISTS idx_trip_fares_destination_stop_id ON public.trip_fares (destination_stop_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_booking_id ON public.support_tickets (booking_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_trip_id ON public.support_tickets (trip_id);
CREATE INDEX IF NOT EXISTS idx_incidents_driver_id ON public.incidents (driver_id);
CREATE INDEX IF NOT EXISTS idx_reviews_vehicle_id ON public.reviews (vehicle_id);
CREATE INDEX IF NOT EXISTS idx_loc_hist_driver ON public.vehicle_location_history (driver_id);
```

---

## 4. Redundant Index Removal Validation (38 Proposed Removals)

All 38 proposed index removals were validated individually:
- **Physical Existence**: Every index exists in `pg_class`.
- **Constraint Independence**: None of the 38 indexes back a `PRIMARY KEY` or `UNIQUE` constraint (`pg_constraint.conindid` is NULL for all 38).
- **Partition Independence**: None are partition-parent indexes (`relkind != 'I'`).
- **Logical Enforcement**: 100% of underlying `UNIQUE` constraints are backed by their dedicated `uq_*` indexes, ensuring zero loss of constraint enforcement.
- **Explicit Retention**: In accordance with user instructions, `idx_seats_layout` and `idx_trip_fares_lookup` **ARE NOT INCLUDED** in the drop set and are preserved.

### Index Drop Evaluation Matrix (38 Indexes):

| Index Name | Table Name | Redundancy Reason | Replacement Index | Safe to Drop? |
| :--- | :--- | :--- | :--- | :---: |
| `idx_booking_canc_booking` | `booking_cancellations` | Exact duplicate of unique constraint index | `uq_booking_canc_booking` | **SAFE TO REMOVE** |
| `idx_booking_canc_ref` | `booking_cancellations` | Exact duplicate of unique constraint index | `uq_booking_canc_ref` | **SAFE TO REMOVE** |
| `idx_booking_resched_orig` | `booking_reschedules` | Exact duplicate of unique constraint index | `uq_booking_resched_orig` | **SAFE TO REMOVE** |
| `idx_bookings_ref` | `bookings` | Exact duplicate of unique constraint index | `uq_bookings_ref` | **SAFE TO REMOVE** |
| `idx_coupons_code` | `coupons` | Exact duplicate of unique constraint index | `uq_coupons_code` | **SAFE TO REMOVE** |
| `idx_discounts_code` | `discounts` | Exact duplicate of unique constraint index | `uq_discounts_code` | **SAFE TO REMOVE** |
| `idx_driver_doc_types_code` | `driver_document_types` | Exact duplicate of unique constraint index | `uq_driver_doc_types_code` | **SAFE TO REMOVE** |
| `idx_drivers_emp_code` | `drivers` | Exact duplicate of unique constraint index | `uq_drivers_emp_code` | **SAFE TO REMOVE** |
| `idx_drivers_license` | `drivers` | Exact duplicate of unique constraint index | `uq_drivers_license` | **SAFE TO REMOVE** |
| `idx_fare_products_code` | `fare_products` | Exact duplicate of unique constraint index | `uq_fare_products_code` | **SAFE TO REMOVE** |
| `idx_feature_flags_key` | `feature_flags` | Exact duplicate of unique constraint index | `uq_feature_flags_key` | **SAFE TO REMOVE** |
| `idx_incident_types_code` | `incident_types` | Exact duplicate of unique constraint index | `uq_incident_types_code` | **SAFE TO REMOVE** |
| `idx_incidents_num` | `incidents` | Exact duplicate of unique constraint index | `uq_incidents_num` | **SAFE TO REMOVE** |
| `idx_invoices_num` | `invoices` | Exact duplicate of unique constraint index | `uq_invoices_num` | **SAFE TO REMOVE** |
| `idx_lost_found_num` | `lost_found_reports` | Exact duplicate of unique constraint index | `uq_lost_found_num` | **SAFE TO REMOVE** |
| `idx_passenger_profiles_user_id` | `passenger_profiles` | Exact duplicate of unique constraint index | `uq_passenger_profiles_user` | **SAFE TO REMOVE** |
| `idx_payment_events_provider_event` | `payment_events` | Exact duplicate of unique constraint index | `uq_payment_events_provider_event` | **SAFE TO REMOVE** |
| `idx_payments_ref` | `payments` | Exact duplicate of unique constraint index | `uq_payments_ref` | **SAFE TO REMOVE** |
| `idx_refunds_ref` | `refunds` | Exact duplicate of unique constraint index | `uq_refunds_ref` | **SAFE TO REMOVE** |
| `idx_review_resp_review` | `review_responses` | Exact duplicate of unique constraint index | `uq_review_resp_review` | **SAFE TO REMOVE** |
| `idx_route_stops_route_seq` | `route_stops` | Exact duplicate of unique constraint index | `uq_route_stops_route_seq` | **SAFE TO REMOVE** |
| `idx_routes_code` | `routes` | Exact duplicate of unique constraint index | `uq_routes_code` | **SAFE TO REMOVE** |
| `idx_stops_code` | `stops` | Exact duplicate of unique constraint index | `uq_stops_code` | **SAFE TO REMOVE** |
| `idx_support_tickets_num` | `support_tickets` | Exact duplicate of unique constraint index | `uq_support_tickets_num` | **SAFE TO REMOVE** |
| `idx_system_settings_key` | `system_settings` | Exact duplicate of unique constraint index | `uq_system_settings_key` | **SAFE TO REMOVE** |
| `idx_tracking_devices_imei` | `tracking_devices` | Exact duplicate of unique constraint index | `uq_tracking_devices_imei` | **SAFE TO REMOVE** |
| `idx_user_preferences_user_id` | `user_preferences` | Exact duplicate of unique constraint index | `uq_user_preferences_user` | **SAFE TO REMOVE** |
| `idx_vehicle_types_code` | `vehicle_types` | Exact duplicate of unique constraint index | `uq_vehicle_types_code` | **SAFE TO REMOVE** |
| `idx_vehicles_reg_num` | `vehicles` | Exact duplicate of unique constraint index | `uq_vehicles_reg_num` | **SAFE TO REMOVE** |
| `idx_role_permissions_role_id` | `role_permissions` | Leftmost prefix of composite unique index | `uq_role_permissions_role_perm` | **SAFE TO REMOVE** |
| `idx_user_roles_user_id` | `user_roles` | Leftmost prefix of composite unique index | `uq_user_roles_user_role` | **SAFE TO REMOVE** |
| `idx_driver_docs_driver` | `driver_documents` | Leftmost prefix of composite unique index | `uq_driver_docs_type` | **SAFE TO REMOVE** |
| `idx_payment_attempts_payment` | `payment_attempts` | Leftmost prefix of composite unique index | `uq_payment_attempts_num` | **SAFE TO REMOVE** |
| `idx_notif_templates_code` | `notification_templates` | Leftmost prefix of composite unique index | `uq_notif_templates_code_chan` | **SAFE TO REMOVE** |
| `idx_notif_pref_user` | `notification_preferences` | Leftmost prefix of composite unique index | `uq_notif_pref_user_chan_cat` | **SAFE TO REMOVE** |
| `idx_vehicle_models_mfg` | `vehicle_models` | Leftmost prefix of composite unique index | `uq_vehicle_models_mfg_name` | **SAFE TO REMOVE** |
| `idx_sched_stops_sched` | `schedule_stops` | Leftmost prefix of composite unique index | `uq_sched_stops_sched_seq` | **SAFE TO REMOVE** |
| `idx_trip_stops_trip` | `trip_stops` | Leftmost prefix of composite unique index | `uq_trip_stops_trip_seq` | **SAFE TO REMOVE** |

---

## 5. Function Security Hardening Validation (7 Functions)

The 7 Movana application functions were validated against `pg_proc`:

| Function Signature | Owner | Security Definer? | Volatility | Current `proconfig` | Proposed Action | Syntax Valid? |
| :--- | :--- | :---: | :---: | :---: | :--- | :---: |
| `public.fn_calculate_trip_available_seats(uuid)` | `postgres` | `false` | `VOLATILE` | `NULL` | `SET search_path = public, pg_temp;` | **PASS** |
| `public.fn_generate_booking_reference()` | `postgres` | `false` | `VOLATILE` | `NULL` | `SET search_path = public, pg_temp;` | **PASS** |
| `public.fn_generate_invoice_number()` | `postgres` | `false` | `VOLATILE` | `NULL` | `SET search_path = public, pg_temp;` | **PASS** |
| `public.fn_log_booking_status_transition()` | `postgres` | `false` | `VOLATILE` | `NULL` | `SET search_path = public, pg_temp;` | **PASS** |
| `public.fn_log_trip_status_transition()` | `postgres` | `false` | `VOLATILE` | `NULL` | `SET search_path = public, pg_temp;` | **PASS** |
| `public.fn_record_audit_log()` | `postgres` | `false` | `VOLATILE` | `NULL` | `SET search_path = public, pg_temp;` | **PASS** |
| `public.fn_set_updated_at()` | `postgres` | `false` | `VOLATILE` | `NULL` | `SET search_path = public, pg_temp;` | **PASS** |

* **Zero Recompilation Risk**: `ALTER FUNCTION ... SET` updates only metadata in `pg_proc.proconfig`.
* **Zero Dependency Impact**: Triggers referencing these functions remain active and valid without locking issues.

---

## 6. GPS Partition Hardening Validation

### 6.1 Hierarchy & Data Metrics:
* **Parent Table**: `public.vehicle_location_history` (RANGE partitioned on `recorded_at`).
* **Active Child Partitions**:
  * `vehicle_location_history_y2026m09`: `2026-09-01` to `2026-10-01` (550 rows)
  * `vehicle_location_history_y2026m10`: `2026-10-01` to `2026-11-01` (550 rows)
  * `vehicle_location_history_y2026m11`: `2026-11-01` to `2026-12-01` (400 rows)
  * `vehicle_location_history_default`: `DEFAULT` (100 rows)
* **Default Partition Audit**:
  * Row Count: Exactly 100 rows.
  * Minimum timestamp: `2026-12-10 11:30:00+05:30`
  * Maximum timestamp: `2026-12-10 12:19:30+05:30`
  * Out-of-range rows: **0 rows** (100% of rows belong strictly to December 2026).

### 6.2 Transactional Sequence Proof:
1. `ALTER TABLE ... DETACH PARTITION vehicle_location_history_default;`:
   * *Correctness*: Supported natively in PostgreSQL 16 within a transaction. Converts default partition into a standalone table.
2. `CREATE TABLE vehicle_location_history_y2026m12..y2027m03 PARTITION OF vehicle_location_history`:
   * *Correctness*: Succeeds instantly because no default partition is attached to check for overlapping ranges.
3. `WITH moved_telemetry AS (DELETE FROM vehicle_location_history_default ... RETURNING ...) INSERT INTO vehicle_location_history ...`:
   * *Correctness*: Atomically deletes 100 rows from the standalone table and inserts them into the parent. Because `y2026m12` is now attached, PostgreSQL's declarative router directs all 100 rows into `y2026m12`.
   * *Explicit Columns*: Columns are explicitly named (`id, vehicle_id, trip_id, driver_id, latitude, longitude, accuracy_meters, speed_kmh, heading_degrees, altitude_meters, odometer, recorded_at, received_at, source`), guaranteeing immunity to column drift.
4. `Assertion: SELECT count(*) FROM vehicle_location_history_default = 0`:
   * *Correctness*: Verifies that zero rows remain in the detached table before re-attachment.
5. `ALTER TABLE ... ATTACH PARTITION vehicle_location_history_default DEFAULT;`:
   * *Correctness*: Because the table is empty, PostgreSQL verifies 0 rows against existing partition bounds and re-attaches it as `DEFAULT` instantaneously with zero locking delay.
6. `Assertion: Total GPS count = 1600, Dec partition count = 100`:
   * *Correctness*: Guarantees zero data loss and verifies proper routing before the transaction commits.

---

## 7. Transaction Safety Analysis

The existing Movana migration runner executes each migration inside an explicit transaction block:
```text
BEGIN;
[Migration SQL Statements]
COMMIT;
```

### Static Transaction Compatibility Check:
* **No `CONCURRENTLY` Keywords**: The script uses standard `CREATE INDEX` and `DROP INDEX`, which are fully transactional. (Commands with `CONCURRENTLY` cannot run inside transaction blocks and would cause runner failure).
* **Transactional DDL**: PostgreSQL supports transactional DDL for all operations in V025 (`CREATE INDEX`, `DROP INDEX`, `ALTER FUNCTION`, `ALTER TABLE ... DETACH PARTITION`, `CREATE TABLE ... PARTITION OF`, `ALTER TABLE ... ATTACH PARTITION`).
* **Atomic Consistency**: The entire migration succeeds or fails as a single unit of work.

---

## 8. Rollback Analysis

Because `V025` is 100% transactional:
* If any statement fails (e.g. an assertion detects an unexpected row count), PostgreSQL automatically rolls back the entire transaction.
* **Effect of Automatic Rollback**:
  * Any created indexes are discarded.
  * Any dropped indexes remain on disk.
  * Altered functions retain their original settings.
  * Detached default partition remains attached.
  * Telemetry rows remain in their original partitions.
  * The database returns to its exact Phase 1 baseline state without human intervention.

---

## 9. Post-Migration Verification Plan

Upon execution of V025, the following read-only SQL suite must be executed:

```sql
-- 1. Verify V025 ledger recording
SELECT version, description, success FROM schema_migrations WHERE version = 'V025';

-- 2. Verify total index count (Expected: 345)
SELECT count(*) AS total_indexes FROM pg_indexes WHERE schemaname = 'public';

-- 3. Verify all 38 redundant indexes were pruned
SELECT count(*) AS remaining_pruned_indexes 
FROM pg_class 
WHERE relname IN (
    'idx_booking_canc_booking', 'idx_booking_canc_ref', 'idx_booking_resched_orig',
    'idx_bookings_ref', 'idx_coupons_code', 'idx_discounts_code',
    'idx_driver_doc_types_code', 'idx_drivers_emp_code', 'idx_drivers_license',
    'idx_fare_products_code', 'idx_feature_flags_key', 'idx_incident_types_code',
    'idx_incidents_num', 'idx_invoices_num', 'idx_lost_found_num',
    'idx_passenger_profiles_user_id', 'idx_payment_events_provider_event',
    'idx_payments_ref', 'idx_refunds_ref', 'idx_review_resp_review',
    'idx_route_stops_route_seq', 'idx_routes_code', 'idx_stops_code',
    'idx_support_tickets_num', 'idx_system_settings_key', 'idx_tracking_devices_imei',
    'idx_user_preferences_user_id', 'idx_vehicle_types_code', 'idx_vehicles_reg_num',
    'idx_role_permissions_role_id', 'idx_user_roles_user_id', 'idx_driver_docs_driver',
    'idx_payment_attempts_payment', 'idx_notif_templates_code', 'idx_notif_pref_user',
    'idx_vehicle_models_mfg', 'idx_sched_stops_sched', 'idx_trip_stops_trip'
); -- MUST BE 0

-- 4. Verify all 21 supporting indexes exist
SELECT count(*) AS active_supporting_indexes 
FROM pg_class 
WHERE relname IN (
    'idx_booking_seats_passenger_id', 'idx_booking_seats_seat_id',
    'idx_bookings_origin_stop_id', 'idx_bookings_destination_stop_id',
    'idx_routes_destination_stop_id', 'idx_schedule_stops_stop_id',
    'idx_trips_schedule_id', 'idx_trips_secondary_driver_id', 'idx_trips_current_stop_id',
    'idx_driver_safety_events_trip_id', 'idx_geofence_events_trip_id',
    'idx_vehicle_assignments_trip_id', 'idx_vehicle_inspections_trip_id',
    'idx_fare_rules_route_id', 'idx_trip_fares_origin_stop_id',
    'idx_trip_fares_destination_stop_id', 'idx_support_tickets_booking_id',
    'idx_support_tickets_trip_id', 'idx_incidents_driver_id', 'idx_reviews_vehicle_id',
    'idx_loc_hist_driver'
); -- MUST BE 21

-- 5. Verify search_path on 7 functions
SELECT count(*) AS hardened_functions 
FROM pg_proc 
WHERE proname LIKE 'fn_%' 
  AND pronamespace = 'public'::regnamespace 
  AND proconfig = ARRAY['search_path=public, pg_temp']; -- MUST BE 7

-- 6. Verify GPS partition row counts and bounds
SELECT 'y2026m12' AS part, count(*) FROM vehicle_location_history_y2026m12
UNION ALL
SELECT 'default', count(*) FROM vehicle_location_history_default
UNION ALL
SELECT 'total_gps', count(*) FROM vehicle_location_history;
-- MUST RETURN: y2026m12 = 100, default = 0, total_gps = 1600

-- 7. Run integrity suite
-- powershell -ExecutionPolicy Bypass -File tests/database/integrity-suite.ps1
```

---

## 10. Corrections Implemented to V025

During static pre-execution audit, the following engineering refinements were incorporated into `database/migrations/V025__database_optimizations.sql`:
1. **Explicit Column Mapping in Relocation CTE**: Modified `SELECT * FROM moved_telemetry` to explicitly declare all 14 column names, preventing any possibility of column-order mismatch during partition routing.
2. **Explicit Retention of Reviewed Indexes**: Verified that `idx_seats_layout` and `idx_trip_fares_lookup` are completely excluded from the drop list.

---

## 11. Final Validation Verdict

### **STATUS: APPROVED FOR EXECUTION**

The migration script [`database/migrations/V025__database_optimizations.sql`](file:///c:/Users/Manoj/OneDrive/Desktop/Movana/database/migrations/V025__database_optimizations.sql) has passed all static syntax, relational dependency, transaction safety, and partition lifecycle validations. It is ready for deployment whenever authorized by project leadership.
