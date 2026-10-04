# Movana Database Migration V025 — Post-Execution Verification Report

**Date:** 2026-09-30  
**Target Database:** `movana` (PostgreSQL 16.13, localhost:5432)  
**Migration File:** `database/migrations/V025__database_optimizations.sql`  
**Execution Status:** EXECUTED & COMMITTED  
**Audit Mode:** STRICTLY READ-ONLY (No state-changing DDL/DML executed during verification)

---

## 1. Executive Summary & Execution Confirmation

Migration `V025__database_optimizations.sql` was executed and committed against the live PostgreSQL database `movana`. A comprehensive, read-only post-execution audit was conducted to verify catalog integrity, index creation, index pruning, function search-path security, declarative partition realignment, foreign key constraints, and object inventory metrics.

All post-execution verification checks have **PASSED** without discrepancies.

---

## 2. Migration Ledger Verification (`public.schema_migrations`)

The `schema_migrations` tracking table was inspected to verify sequential integrity, recording accuracy, and file checksum matching.

### 2.1 Applied Migration Inventory

```sql
SELECT version, description, execution_time_ms, substring(checksum from 1 for 8) as chksum8, success 
FROM public.schema_migrations 
ORDER BY version;
```

| Version | Description | Execution Time (ms) | Checksum (8 chars) | Success |
| :--- | :--- | :---: | :---: | :---: |
| **V001** | extensions | 492 | `f70a25f7` | `t` |
| **V002** | users | 108 | `e6f0574f` | `t` |
| **V003** | roles_permissions | 105 | `98fbea2e` | `t` |
| **V004** | passenger_profiles | 67 | `2d1e1c90` | `t` |
| **V005** | emergency_contacts | 76 | `a9c70314` | `t` |
| **V006** | drivers | 203 | `08f080d3` | `t` |
| **V007** | driver_documents | 101 | `0041e685` | `t` |
| **V008** | vehicles | 169 | `2dc4b9cb` | `t` |
| **V009** | vehicle_documents | 85 | `749863fa` | `t` |
| **V010** | vehicle_maintenance | 153 | `1fd73e68` | `t` |
| **V011** | seat_layouts | 199 | `c9392a0b` | `t` |
| **V012** | routes_stops | 239 | `bca2496d` | `t` |
| **V013** | schedules_calendars | 227 | `b8fe9fb2` | `t` |
| **V014** | trips | 394 | `eaa7fb04` | `t` |
| **V015** | bookings | 188 | `c830e298` | `t` |
| **V016** | fares_pricing | 227 | `ec8d9ef6` | `t` |
| **V017** | payments_refunds | 200 | `4711a6a2` | `t` |
| **V018** | gps_tracking | 157 | `b4463b45` | `t` |
| **V019** | safety_incidents | 189 | `f946721a` | `t` |
| **V020** | notifications | 152 | `4db46adf` | `t` |
| **V021** | reviews_support_lost_found | 168 | `b468de52` | `t` |
| **V022** | audit_security | 65 | `864c7720` | `t` |
| **V023** | settings_attachments | 100 | `e928e132` | `t` |
| **V024** | views | 91 | `0ca6a4b8` | `t` |
| **V025** | database_optimizations | 443 | `79f05295` | `t` |

### 2.2 Ledger Integrity Findings
- **Total Migrations Recorded:** Exactly 25 successful migrations exist.
- **Sequential Continuity:** Every version from `V001` through `V025` is present; gap analysis returned 0 missing versions.
- **Duplicate Check:** Grouping by `version HAVING count(*) > 1` returned 0 rows.
- **V025 Record Details:**
  - Description: `database_optimizations`
  - Script Name: `V025__database_optimizations.sql`
  - Execution Time: 443 ms
  - Installed By: `postgres`
  - Success Flag: `true`
- **Cryptographic Hash Verification:**
  - File SHA-256 (`database/migrations/V025__database_optimizations.sql`): `79f05295140564953ad21c25f18fabfdd7dc1097d582b116e480732e109ee64f`
  - Recorded Ledger Checksum: `79f05295140564953ad21c25f18fabfdd7dc1097d582b116e480732e109ee64f`
  - **Match:** 100% exact match.

---

## 3. Foreign-Key Supporting Index Verification

Every `CREATE INDEX` statement in Part A of `V025__database_optimizations.sql` was verified against `pg_catalog.pg_index` and `pg_class`.

| Expected Index Name | Target Table | Indexed Column(s) | Catalog Status | Valid (`indisvalid`) | Ready (`indisready`) | Result |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: |
| `idx_booking_seats_passenger_id` | `booking_seats` | `(passenger_id)` | Present | `true` | `true` | **PASS** |
| `idx_booking_seats_seat_id` | `booking_seats` | `(seat_id)` | Present | `true` | `true` | **PASS** |
| `idx_bookings_origin_stop_id` | `bookings` | `(origin_stop_id)` | Present | `true` | `true` | **PASS** |
| `idx_bookings_destination_stop_id` | `bookings` | `(destination_stop_id)` | Present | `true` | `true` | **PASS** |
| `idx_routes_destination_stop_id` | `routes` | `(destination_stop_id)` | Present | `true` | `true` | **PASS** |
| `idx_schedule_stops_stop_id` | `schedule_stops` | `(stop_id)` | Present | `true` | `true` | **PASS** |
| `idx_trips_schedule_id` | `trips` | `(schedule_id)` | Present | `true` | `true` | **PASS** |
| `idx_trips_secondary_driver_id` | `trips` | `(secondary_driver_id)` | Present | `true` | `true` | **PASS** |
| `idx_trips_current_stop_id` | `trips` | `(current_stop_id)` | Present | `true` | `true` | **PASS** |
| `idx_driver_safety_events_trip_id` | `driver_safety_events` | `(trip_id)` | Present | `true` | `true` | **PASS** |
| `idx_geofence_events_trip_id` | `geofence_events` | `(trip_id)` | Present | `true` | `true` | **PASS** |
| `idx_vehicle_assignments_trip_id` | `vehicle_assignments` | `(trip_id)` | Present | `true` | `true` | **PASS** |
| `idx_vehicle_inspections_trip_id` | `vehicle_inspections` | `(trip_id)` | Present | `true` | `true` | **PASS** |
| `idx_fare_rules_route_id` | `fare_rules` | `(route_id)` | Present | `true` | `true` | **PASS** |
| `idx_trip_fares_origin_stop_id` | `trip_fares` | `(origin_stop_id)` | Present | `true` | `true` | **PASS** |
| `idx_trip_fares_destination_stop_id` | `trip_fares` | `(destination_stop_id)` | Present | `true` | `true` | **PASS** |
| `idx_support_tickets_booking_id` | `support_tickets` | `(booking_id)` | Present | `true` | `true` | **PASS** |
| `idx_support_tickets_trip_id` | `support_tickets` | `(trip_id)` | Present | `true` | `true` | **PASS** |
| `idx_incidents_driver_id` | `incidents` | `(driver_id)` | Present | `true` | `true` | **PASS** |
| `idx_reviews_vehicle_id` | `reviews` | `(vehicle_id)` | Present | `true` | `true` | **PASS** |
| `idx_loc_hist_driver` | `vehicle_location_history` | `(driver_id)` | Present (Partitioned) | `true` | `true` | **PASS** |

*Note on Partitioned Index:* `idx_loc_hist_driver` on `vehicle_location_history` automatically cascaded to all 8 attached child partitions in `pg_inherits`.

---

## 4. Index Drop & Retention Verification

### 4.1 Dropped Index Verification (38 Total Drops)

Every `DROP INDEX` statement from Part B was checked against `pg_catalog.pg_class`. Confirmed:
1. Zero dropped indexes remain in the catalog.
2. None of the dropped indexes backed a Primary Key constraint.
3. None of the dropped indexes backed a UNIQUE constraint (unique constraints were backed by separate `uq_*` indexes).
4. None were partition-required indexes.
5. Intended replacement / covering indexes exist and remain valid.

#### B.1: 29 Exact Duplicate B-Tree Indexes Dropped

| # | Dropped Index Name | Table | Covering Unique Index | Status in Catalog | Covering Index Valid |
| :---: | :--- | :--- | :--- | :---: | :---: |
| 1 | `idx_booking_canc_booking` | `booking_cancellations` | `uq_booking_canc_booking` | Dropped | `true` |
| 2 | `idx_booking_canc_ref` | `booking_cancellations` | `uq_booking_canc_ref` | Dropped | `true` |
| 3 | `idx_booking_resched_orig` | `booking_reschedules` | `uq_booking_resched_orig` | Dropped | `true` |
| 4 | `idx_bookings_ref` | `bookings` | `uq_bookings_ref` | Dropped | `true` |
| 5 | `idx_coupons_code` | `coupons` | `uq_coupons_code` | Dropped | `true` |
| 6 | `idx_discounts_code` | `discounts` | `uq_discounts_code` | Dropped | `true` |
| 7 | `idx_driver_doc_types_code` | `driver_document_types` | `uq_driver_doc_types_code` | Dropped | `true` |
| 8 | `idx_drivers_emp_code` | `drivers` | `uq_drivers_emp_code` | Dropped | `true` |
| 9 | `idx_drivers_license` | `drivers` | `uq_drivers_license` | Dropped | `true` |
| 10 | `idx_fare_products_code` | `fare_products` | `uq_fare_products_code` | Dropped | `true` |
| 11 | `idx_feature_flags_key` | `feature_flags` | `uq_feature_flags_key` | Dropped | `true` |
| 12 | `idx_incident_types_code` | `incident_types` | `uq_incident_types_code` | Dropped | `true` |
| 13 | `idx_incidents_num` | `incidents` | `uq_incidents_num` | Dropped | `true` |
| 14 | `idx_invoices_num` | `invoices` | `uq_invoices_num` | Dropped | `true` |
| 15 | `idx_lost_found_num` | `lost_found_reports` | `uq_lost_found_num` | Dropped | `true` |
| 16 | `idx_passenger_profiles_user_id` | `passenger_profiles` | `uq_passenger_profiles_user` | Dropped | `true` |
| 17 | `idx_payment_events_provider_event`| `payment_events` | `uq_payment_events_provider_event` | Dropped | `true` |
| 18 | `idx_payments_ref` | `payments` | `uq_payments_ref` | Dropped | `true` |
| 19 | `idx_refunds_ref` | `refunds` | `uq_refunds_ref` | Dropped | `true` |
| 20 | `idx_review_resp_review` | `review_responses` | `uq_review_resp_review` | Dropped | `true` |
| 21 | `idx_route_stops_route_seq` | `route_stops` | `uq_route_stops_route_seq` | Dropped | `true` |
| 22 | `idx_routes_code` | `routes` | `uq_routes_code` | Dropped | `true` |
| 23 | `idx_stops_code` | `stops` | `uq_stops_code` | Dropped | `true` |
| 24 | `idx_support_tickets_num` | `support_tickets` | `uq_support_tickets_num` | Dropped | `true` |
| 25 | `idx_system_settings_key` | `system_settings` | `uq_system_settings_key` | Dropped | `true` |
| 26 | `idx_tracking_devices_imei` | `tracking_devices` | `uq_tracking_devices_imei` | Dropped | `true` |
| 27 | `idx_user_preferences_user_id` | `user_preferences` | `uq_user_preferences_user` | Dropped | `true` |
| 28 | `idx_vehicle_types_code` | `vehicle_types` | `uq_vehicle_types_code` | Dropped | `true` |
| 29 | `idx_vehicles_reg_num` | `vehicles` | `uq_vehicles_reg_num` | Dropped | `true` |

#### B.2: 9 Safe Leftmost-Prefix Redundant Indexes Dropped

| # | Dropped Index Name | Table | Dropped Column(s) | Covering Composite Index & Columns | Status |
| :---: | :--- | :--- | :--- | :--- | :---: |
| 30 | `idx_role_permissions_role_id` | `role_permissions` | `(role_id)` | `uq_role_permissions_role_perm (role_id, permission_id)` | Dropped |
| 31 | `idx_user_roles_user_id` | `user_roles` | `(user_id)` | `uq_user_roles_user_role (user_id, role_id)` | Dropped |
| 32 | `idx_driver_docs_driver` | `driver_documents` | `(driver_id)` | `uq_driver_docs_type (driver_id, document_type_id)` | Dropped |
| 33 | `idx_payment_attempts_payment` | `payment_attempts` | `(payment_id)` | `uq_payment_attempts_num (payment_id, attempt_number)` | Dropped |
| 34 | `idx_notif_templates_code` | `notification_templates` | `(template_code)` | `uq_notif_templates_code_chan (template_code, channel)` | Dropped |
| 35 | `idx_notif_pref_user` | `notification_preferences` | `(user_id)` | `uq_notif_pref_user_chan_cat (user_id, channel, category)` | Dropped |
| 36 | `idx_vehicle_models_mfg` | `vehicle_models` | `(manufacturer_id)` | `uq_vehicle_models_mfg_name (manufacturer_id, name)` | Dropped |
| 37 | `idx_sched_stops_sched` | `schedule_stops` | `(schedule_id)` | `uq_sched_stops_sched_seq (schedule_id, sequence_number)` | Dropped |
| 38 | `idx_trip_stops_trip` | `trip_stops` | `(trip_id)` | `uq_trip_stops_trip_seq (trip_id, sequence_number)` | Dropped |

### 4.2 Explicitly Retained Indexes Verification

Both explicitly protected operational indexes were verified in `pg_catalog`:

| Retained Index Name | Table | Columns | Index Definition | Valid (`indisvalid`) | Status |
| :--- | :--- | :--- | :--- | :---: | :---: |
| `idx_seats_layout` | `seats` | `(layout_id)` | `CREATE INDEX idx_seats_layout ON public.seats USING btree (layout_id)` | `true` | **RETAINED** |
| `idx_trip_fares_lookup` | `trip_fares` | `(trip_id, origin_stop_id, destination_stop_id)` | `CREATE INDEX idx_trip_fares_lookup ON public.trip_fares USING btree (trip_id, origin_stop_id, destination_stop_id)` | `true` | **RETAINED** |

---

## 5. Function Search-Path Hardening Verification

All 7 core database functions modified in Part C were inspected in `pg_proc`:

```sql
SELECT proname, proconfig FROM pg_proc WHERE proname IN (...)
```

| Function Name | Signature | Security Definer | Configured `proconfig` | Result |
| :--- | :--- | :---: | :---: | :---: |
| `fn_calculate_trip_available_seats` | `(p_trip_id uuid)` | `false` | `{"search_path=public, pg_temp"}` | **HARDENED** |
| `fn_generate_booking_reference` | `()` | `false` | `{"search_path=public, pg_temp"}` | **HARDENED** |
| `fn_generate_invoice_number` | `()` | `false` | `{"search_path=public, pg_temp"}` | **HARDENED** |
| `fn_log_booking_status_transition` | `()` | `false` | `{"search_path=public, pg_temp"}` | **HARDENED** |
| `fn_log_trip_status_transition` | `()` | `false` | `{"search_path=public, pg_temp"}` | **HARDENED** |
| `fn_record_audit_log` | `()` | `false` | `{"search_path=public, pg_temp"}` | **HARDENED** |
| `fn_set_updated_at` | `()` | `false` | `{"search_path=public, pg_temp"}` | **HARDENED** |

---

## 6. GPS Partition Verification (`vehicle_location_history`)

### 6.1 Partition Inventory & Row Counts

```sql
SELECT c.relname, pg_get_expr(c.relpartbound, c.oid) AS partition_bound, count(*) 
FROM pg_inherits inh 
JOIN pg_class c ON c.oid = inh.inhrelid 
...
```

| Partition Table Name | Bound Expression (UTC / Local) | Row Count | Status |
| :--- | :--- | :---: | :---: |
| `vehicle_location_history_default` | `DEFAULT` | **0** | **ATTACHED & EMPTY** |
| `vehicle_location_history_y2026m09` | `FROM ('2026-09-01 00:00:00+00') TO ('2026-10-01 00:00:00+00')` | 550 | Existing Partition |
| `vehicle_location_history_y2026m10` | `FROM ('2026-10-01 00:00:00+00') TO ('2026-11-01 00:00:00+00')` | 550 | Existing Partition |
| `vehicle_location_history_y2026m11` | `FROM ('2026-11-01 00:00:00+00') TO ('2026-12-01 00:00:00+00')` | 400 | Existing Partition |
| `vehicle_location_history_y2026m12` | `FROM ('2026-12-01 00:00:00+00') TO ('2027-01-01 00:00:00+00')` | **100** | **NEW (V025 Created)** |
| `vehicle_location_history_y2027m01` | `FROM ('2027-01-01 00:00:00+00') TO ('2027-02-01 00:00:00+00')` | **0** | **NEW (V025 Created)** |
| `vehicle_location_history_y2027m02` | `FROM ('2027-02-01 00:00:00+00') TO ('2027-03-01 00:00:00+00')` | **0** | **NEW (V025 Created)** |
| `vehicle_location_history_y2027m03` | `FROM ('2027-03-01 00:00:00+00') TO ('2027-04-01 00:00:00+00')` | **0** | **NEW (V025 Created)** |
| **Parent Table Total (`public.vehicle_location_history`)** | — | **1600** | **VERIFIED CONSISTENT** |

### 6.2 Specific Itemized Confirmations (A through K)
- **A. December 2026 partition exists:** Confirmed (`vehicle_location_history_y2026m12`).
- **B. January 2027 partition exists:** Confirmed (`vehicle_location_history_y2027m01`).
- **C. February 2027 partition exists:** Confirmed (`vehicle_location_history_y2027m02`).
- **D. March 2027 partition exists:** Confirmed (`vehicle_location_history_y2027m03`).
- **E. Relocation of 100 December 2026 rows:** The 100 rows with timestamps between `2026-12-10 11:30:00` and `2026-12-10 12:19:30` (min: `2026-12-10 11:30:00+05:30`, max: `2026-12-10 12:19:30+05:30`) are successfully routed into `vehicle_location_history_y2026m12`.
- **F. Row count in December 2026 partition:** Exactly **100 rows**.
- **G. Row count in default partition:** Exactly **0 rows**.
- **H. Remaining December 2026 rows in default:** Exactly **0 rows**.
- **I. Partition bounds contiguous and non-overlapping:** Verified across all consecutive ranges from September 2026 through March 2027 without overlaps or gaps.
- **J. Default partition re-attached:** Confirmed attached in `pg_inherits`.
- **K. Total telemetry row count consistency:** Exactly **1600 rows** before and after relocation.

---

## 7. Foreign Key Verification

### 7.1 Catalog Foreign Key Metric
- **Total Active Foreign Keys:** **193** constraints in schema `public`.
- **Orphaned Row Audit:** Executed dynamic foreign-key validation across all 193 foreign keys. Result: **0 orphaned rows** detected across all relations.
- **V025 Index-to-FK Coverage:** All 21 indexes created in V025 correspond directly to active foreign key constraints:
  - `booking_seats (passenger_id)` $\rightarrow$ `fk_booking_seats_passenger`
  - `booking_seats (seat_id)` $\rightarrow$ `fk_booking_seats_seat`
  - `bookings (origin_stop_id)` $\rightarrow$ `fk_bookings_orig`
  - `bookings (destination_stop_id)` $\rightarrow$ `fk_bookings_dest`
  - `routes (destination_stop_id)` $\rightarrow$ `fk_routes_dest`
  - `schedule_stops (stop_id)` $\rightarrow$ `fk_sched_stops_stop`
  - `trips (schedule_id)` $\rightarrow$ `fk_trips_schedule`
  - `trips (secondary_driver_id)` $\rightarrow$ `fk_trips_driver2`
  - `trips (current_stop_id)` $\rightarrow$ `fk_trips_stop`
  - `driver_safety_events (trip_id)` $\rightarrow$ `fk_driver_safety_trip`
  - `geofence_events (trip_id)` $\rightarrow$ `fk_geofence_events_trip`
  - `vehicle_assignments (trip_id)` $\rightarrow$ `fk_vehicle_assign_trip`
  - `vehicle_inspections (trip_id)` $\rightarrow$ `fk_vehicle_insp_trip`
  - `fare_rules (route_id)` $\rightarrow$ `fk_fare_rules_route`
  - `trip_fares (origin_stop_id)` $\rightarrow$ `fk_trip_fares_orig`
  - `trip_fares (destination_stop_id)` $\rightarrow$ `fk_trip_fares_dest`
  - `support_tickets (booking_id)` $\rightarrow$ `fk_support_tickets_booking`
  - `support_tickets (trip_id)` $\rightarrow$ `fk_support_tickets_trip`
  - `incidents (driver_id)` $\rightarrow$ `fk_incidents_driver`
  - `reviews (vehicle_id)` $\rightarrow$ `fk_reviews_vehicle`
  - `vehicle_location_history (driver_id)` $\rightarrow$ `fk_loc_hist_driver` (cascaded to all 8 child partitions)

---

## 8. Object Inventory Comparison

Comprehensive comparison between the verified pre-V025 baseline and the live post-V025 database catalog:

| Object Category | Pre-V025 Baseline | Current Catalog (Post-V025) | Net Delta | Architectural Explanation of Difference |
| :--- | :---: | :---: | :---: | :--- |
| **Base Tables (`pg_tables`)** | 109 | **113** | +4 | Addition of 4 new monthly child partition tables (`y2026m12`, `y2027m01`, `y2027m02`, `y2027m03`). |
| **Views (`pg_views`)** | 8 | **8** | 0 | Unchanged. |
| **Functions / Procedures (`pg_proc`)**| 278 | **278** | 0 | Unchanged (search_path modified in place via `ALTER FUNCTION`). |
| **Triggers (`information_schema`)** | 73 | **73** | 0 | Unchanged. |
| **Indexes (`pg_indexes`)** | 342 | **345** | +3 | **Net +3:** -38 dropped indexes, +20 single-table FK indexes, +1 partitioned table parent index (`idx_loc_hist_driver`), +8 child partition indexes for `idx_loc_hist_driver`, and +12 standard inherited indexes across the 4 new partition tables (`pkey`, `vehicle_time`, `trip_time` $\times$ 4). |
| **Foreign Keys (`pg_constraint`)** | 181 | **193** | +12 | PostgreSQL declarative partition inheritance automatically clones the 3 parent foreign keys (`vehicles`, `trips`, `drivers`) to each of the 4 new child partitions (3 $\times$ 4 = +12). |
| **Partitioned Tables** | 1 | **1** | 0 | `vehicle_location_history` remains the sole partitioned table. |
| **Child Partitions (`pg_inherits`)** | 16 | **40** | +24 | Pre-V025 had 4 parent relations (1 table + 3 indexes) $\times$ 4 partitions = 16. Post-V025 has 5 parent relations (1 table + 4 indexes) $\times$ 8 partitions = 40. |

---

## 9. Existing Integrity Test Status

As instructed, the existing database integrity test suite was not re-executed during this verification session. The previously observed and validated execution result remains recorded as:

```text
Database Integrity Test Suite:
9 PASSED
0 FAILED
```

---

## 10. Safety & Non-Modification Assertion

During this entire verification audit:
- Only read-only `SELECT` catalog queries and metadata inspection statements were executed.
- No `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `CREATE`, `TRUNCATE`, `VACUUM`, or `REINDEX` statements were run.
- Target database remained strictly `movana` on PostgreSQL 16.13.

```text
LIVE DATABASE MODIFIED BY THIS VERIFICATION: NO
```

---

## 11. Final Verification Status

```text
V025 POST-EXECUTION VERIFICATION: PASSED
V025 EXECUTED: YES
LIVE DATABASE MODIFIED BY THIS VERIFICATION: NO
```
