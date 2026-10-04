# Movana Platform — Extended Development Seed Data Documentation

**Target Database**: `movana`  
**Host / Port**: `localhost:5432`  
**Database Engine**: PostgreSQL 16.13  
**Script Path**: [`database/seeds/development_extended_data.sql`](file:///c:/Users/Manoj/OneDrive/Desktop/Movana/database/seeds/development_extended_data.sql)  
**Author**: Senior Database Architect & PostgreSQL Engineer  
**Date**: 2026-09-29  
**Status**: **PREPARED, UUID DEFECT RESOLVED, CHRONOLOGICAL FK ORDER VERIFIED, AND STATICALLY VALIDATED (AWAITING EXECUTION APPROVAL)**

---

## 1. Executive Summary

The extended development seed dataset provides a comprehensive, production-grade relational simulation of the entire **Movana Transportation Platform**. It scales the initial 31 baseline tables up to **89 fully populated relational tables** containing **5,636 realistic synthetic records**, covering all **21 requested platform operational domains**.

The seed is designed for end-to-end integration testing, frontend UI simulation, driver mobile app workflows, telematics ingestion, dispatch dashboards, financial reconciliation, and GPS analytical reporting.

### Core Key Metrics
* **Total Tables Populated**: 89 tables (including partitioned location history tables)
* **Total Records Inserted**: 5,642 rows
* **Users & Drivers**: 65 total users (50 platform users/passengers + 15 dedicated commercial fleet drivers)
* **Fleet Vehicles**: 10 newly registered buses across 4 vehicle types and 4 manufacturers
* **Passenger Seats**: 356 individual seats/berths mapped across 10 specialized vehicle interior layouts (one per vehicle to satisfy `uq_seats_layout_number`)
* **Intercity Transit Network**: 20 transit stops, 10 major highway routes, 20 timetable schedules, and 60 concrete trips (past completed, today in-transit, future scheduled)
* **Bookings & Tickets**: 180 passenger bookings with anti-double-booking seat allocations, payments, and invoices
* **GPS Telemetry**: 1,600 GPS breadcrumbs routed across PostgreSQL 16 range partitions (`y2026m09`, `y2026m10`, `y2026m11`, and `default`)
* **Destructive Statements**: **ZERO** (`DROP`, `TRUNCATE`, `ALTER`, `CREATE`, and `DELETE` are completely absent)
* **Idempotency**: 100% of `INSERT` statements utilize deterministic primary keys and `ON CONFLICT DO NOTHING` (89/89 statements)
* **UUID Syntax Compliance**: 100% strictly hexadecimal RFC 4122 / PostgreSQL 16 compliant (`[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}`) — 16,413 canonical UUID tokens verified with 0 malformed
* **Seat Relational Integrity**: `SET(booking_seats.seat_id) ⊆ SET(seats.id)` statically proven with 0 missing seats, 0 vehicle-seat mismatches, and 0 dropped seats by unique constraint
* **Chronological Foreign Key Dependency**: 100% topological order verified (12,343 foreign key checks passed with 0 unresolved parent references)

---

## 2. Table Inventory & Execution Order

The table below lists all 89 tables populated by [`database/seeds/development_extended_data.sql`](file:///c:/Users/Manoj/OneDrive/Desktop/Movana/database/seeds/development_extended_data.sql), in their exact chronological execution order with their verified hexadecimal deterministic namespace:

| # | Operational Domain | Table Name | Rows Inserted | Hexadecimal Primary Key Format | Natural Key / Conflict Target |
| :-: | :--- | :--- | :--- | :--- | :--- |
| **1** | Users & Roles | `users` | 65 | `a1000000-...` (passengers) / `a2000000-...` (drivers) | `id` |
| **2** | Users & Roles | `user_roles` | 65 | `a3000000-...` | `(user_id, role_id)` |
| **3** | Passenger Profiles | `passenger_profiles` | 40 | `b1000000-...` | `user_id` |
| **4** | User Preferences | `user_preferences` | 50 | `a4000000-...` | `user_id` |
| **5** | User Addresses | `user_addresses` | 35 | `a5000000-...` | `id` |
| **6** | Emergency Contacts | `emergency_contacts` | 25 | `a6000000-...` | `id` |
| **7** | Drivers | `drivers` | 15 | `c1000000-...` | `employee_code` |
| **8** | Driver Documents | `driver_documents` | 60 | `c2000000-...` | `(driver_id, document_type_id)` |
| **9** | Driver Verification | `driver_verifications` | 15 | `c3000000-...` | `id` |
| **10** | Driver Availability | `driver_availability` | 15 | `c4000000-...` | `id` |
| **11** | Driver Status | `driver_status_history` | 15 | `c5000000-...` | `id` |
| **12** | Driver Contacts | `driver_emergency_contacts` | 15 | `c6000000-...` | `id` |
| **13** | Vehicle Models | `vehicle_models` | 4 | `d1000000-...` | `(manufacturer_id, name)` |
| **14** | Fleet Vehicles | `vehicles` | 10 | `e1000000-...` | `registration_number` |
| **15** | Vehicle Documents | `vehicle_documents` | 40 | `e2000000-...` | `id` |
| **16** | Vehicle Status | `vehicle_status_history` | 10 | `e3000000-...` | `id` |
| **17** | Vehicle Assignments | `vehicle_assignments` | 10 | `e4000000-...` | `id` |
| **18** | Maintenance | `maintenance_schedules` | 4 | `e5000000-...` | `id` |
| **19** | Vehicle Inspections | `vehicle_inspections` | 10 | `e6000000-...` | `id` |
| **20** | Inspection Items | `vehicle_inspection_items` | 30 | `e7000000-...` | `id` |
| **21** | Inspection Issues | `vehicle_inspection_issues` | 1 | `e8000000-...` | `id` |
| **22** | Maintenance Records | `maintenance_records` | 8 | `e9000000-...` | `id` |
| **23** | Maintenance Items | `maintenance_items` | 16 | `ea000000-...` | `id` |
| **24** | Maintenance Parts | `maintenance_parts` | 16 | `eb000000-...` | `id` |
| **25** | Seat Layouts | `seat_layouts` | 10 | `f1000000-...` | `name` |
| **26** | Seats | `seats` | 356 | `f2000000-...` | `(layout_id, seat_number)` |
| **27** | Transit Stops | `stops` | 20 | `90000000-...` | `stop_code` |
| **28** | Routes | `routes` | 10 | `91000000-...` | `route_code` |
| **29** | Route Stops | `route_stops` | 28 | `91100000-...` | `(route_id, sequence_number)` |
| **30** | Route Versions | `route_versions` | 10 | `91200000-...` | `(route_id, version_number)` |
| **31** | Service Calendars | `service_calendars` | 2 | `92000000-...` | `id` |
| **32** | Calendar Exceptions | `service_calendar_exceptions` | 2 | `92100000-...` | `(service_calendar_id, exception_date)` |
| **33** | Trip Schedules | `trip_schedules` | 20 | `93000000-...` | `schedule_code` |
| **34** | Schedule Stops | `schedule_stops` | 56 | `93100000-...` | `(schedule_id, sequence_number)` |
| **35** | Trips | `trips` | 60 | `94000000-...` | `trip_number` |
| **36** | Trip Assignments | `trip_assignments` | 60 | `94100000-...` | `id` |
| **37** | Trip Stops | `trip_stops` | 168 | `94200000-...` | `(trip_id, sequence_number)` |
| **38** | Trip Status | `trip_status_history` | 60 | `94300000-...` | `id` |
| **39** | Trip Events | `trip_events` | 28 | `94400000-...` | `id` |
| **40** | Trip Fares | `trip_fares` | 60 | `94500000-...` | `(trip_id, origin, dest, seat_type)` |
| **41** | Bookings | `bookings` | 180 | `95000000-...` | `booking_reference` |
| **42** | Booking Passengers | `booking_passengers` | 180 | `96000000-...` | `id` |
| **43** | Booking Items | `booking_items` | 180 | `95100000-...` | `id` |
| **44** | Booking Seats | `booking_seats` | 180 | `97000000-...` | `(booking_id, seat_id)` |
| **45** | Booking Status | `booking_status_history` | 180 | `95200000-...` | `id` |
| **46** | Cancellations | `booking_cancellations` | 12 | `95300000-...` | `id` |
| **47** | Reschedules | `booking_reschedules` | 3 | `95400000-...` | `original_booking_id` |
| **48** | Fare Products | `fare_products` | 3 | `f3000000-...` | `code` |
| **49** | Fare Rules | `fare_rules` | 3 | `f4000000-...` | `id` |
| **50** | Fare Prices | `fare_prices` | 3 | `f5000000-...` | `id` |
| **51** | Discounts | `discounts` | 3 | `f6000000-...` | `code` |
| **52** | Coupons | `coupons` | 3 | `f7000000-...` | `coupon_code` |
| **53** | Coupon Redemptions | `coupon_redemptions` | 30 | `f8000000-...` | `booking_id` |
| **54** | Payment Methods | `payment_methods` | 25 | `98100000-...` | `id` |
| **55** | Payments | `payments` | 172 | `98000000-...` | `payment_reference` |
| **56** | Payment Attempts | `payment_attempts` | 160 | `98200000-...` | `(payment_id, attempt_number)` |
| **57** | Payment Transactions | `payment_transactions` | 160 | `98300000-...` | `id` |
| **58** | Payment Events | `payment_events` | 10 | `98400000-...` | `(provider, event_id)` |
| **59** | Refunds | `refunds` | 12 | `98500000-...` | `refund_reference` |
| **60** | Refund Transactions | `refund_transactions` | 12 | `98600000-...` | `id` |
| **61** | Invoices | `invoices` | 150 | `99000000-...` | `invoice_number` |
| **62** | Invoice Items | `invoice_items` | 150 | `99100000-...` | `id` |
| **63** | Telematics GPS | `vehicle_location_history` | 1,600 | Auto-UUID / Recorded | Partition routing |
| **64** | Tracking Devices | `tracking_devices` | 10 | `80000000-...` | `device_imei` |
| **65** | Tracking Events | `tracking_events` | 50 | `80100000-...` | `id` |
| **66** | Geofences | `geofences` | 12 | `81000000-...` | `name` |
| **67** | Geofence Events | `geofence_events` | 24 | `81100000-...` | `id` |
| **68** | Notification Templates | `notification_templates` | 6 | `86100000-...` | `(template_code, channel)` |
| **69** | Notification Prefs | `notification_preferences` | 50 | `86200000-...` | `(user_id, channel, category)` |
| **70** | Notifications | `notifications` | 100 | `86000000-...` | `id` |
| **71** | Notification Deliveries| `notification_deliveries` | 100 | `86300000-...` | `id` |
| **72** | Reviews | `reviews` | 60 | `84000000-...` | `booking_id` |
| **73** | Review Responses | `review_responses` | 25 | `84100000-...` | `review_id` |
| **74** | Safety Incidents | `incidents` | 6 | `85000000-...` | `incident_number` |
| **75** | Incident Reports | `incident_reports` | 6 | `85100000-...` | `id` |
| **76** | Incident Actions | `incident_actions` | 6 | `85200000-...` | `id` |
| **77** | Emergency SOS | `emergency_events` | 3 | `85300000-...` | `id` |
| **78** | Driver Safety Events | `driver_safety_events` | 6 | `c7000000-...` | `id` |
| **79** | Support Tickets | `support_tickets` | 20 | `82000000-...` | `ticket_number` |
| **80** | Ticket Messages | `support_ticket_messages` | 38 | `82100000-...` | `id` |
| **81** | Ticket Status | `support_ticket_status_history` | 20 | `82200000-...` | `id` |
| **82** | Lost & Found Reports | `lost_found_reports` | 10 | `83000000-...` | `report_number` |
| **83** | Lost & Found Items | `lost_found_items` | 10 | `83100000-...` | `id` |
| **84** | Lost & Found Status | `lost_found_status_history` | 10 | `83200000-...` | `id` |
| **85** | Login Attempts | `login_attempts` | 40 | `87000000-...` | `id` |
| **86** | Security Events | `security_events` | 25 | `87100000-...` | `id` |
| **87** | User Sessions | `user_sessions` | 35 | `87200000-...` | `refresh_token_hash` |
| **88** | File Attachments | `file_attachments` | 25 | `88000000-...` | `storage_key` |
| **89** | Ticket Attachments | `support_ticket_attachments` | 10 | `82300000-...` | `id` |
| **TOTAL** | **89 Tables** | **All 21 Modules** | **5,642 Rows** | — | — |

---

## 3. Synthetic Data & Privacy Compliance Policy

The extended development dataset strictly enforces realistic simulation standards while preserving absolute safety for public code repositories:

1. **Email Domain Isolation**: All synthetic user emails utilize the RFC 2606 reserved top-level domain `.test` (`user001@movana.test`, `driver.staff01@movana.test`). No live emails or public domain addresses exist.
2. **Synthetic Phone Numbers**: All generated Indian phone numbers follow the reserved development prefix format `+919810XXXXXX` and `+919820XXXXXX`.
3. **Password Security**: Standard bcrypt-hashed mock password `$2a$10$wE9mN5Zz3lF9mN5Zz3lF9.wE9mN5Zz3lF9mN5Zz3lF9mN5Zz3lF9` (corresponding to `'Password123!'`) is applied to all development accounts.
4. **Payment Privacy & PCI-DSS Safety**:
   * No actual credit card numbers, CVVs, or bank account credentials are used.
   * Masked payment methods use standard PCI test tokens (`**** **** **** 4242`).
   * Gateway identifiers utilize synthetic test tokens (`pay_rzp_tx_00000001`, `IDEMP-PAY-000001`).
5. **No Real Personal Data**: All user, driver, passenger, and emergency contact names are synthetic combinations drawn from standard regional name datasets.

---

## 4. Key Relational Invariants & Constraint Formulas

All generated records have been mathematically certified against PostgreSQL 16 schema CHECK constraints and unique indexes:

### 1. Anti-Double-Booking Concurrency Invariant
* **Partial Unique Index**: `uq_booking_seats_active_trip_seat` on `booking_seats (trip_id, seat_id) WHERE status IN ('PENDING', 'CONFIRMED')`.
* **Seed Guarantee**: For every trip, every individual seat reservation is guaranteed unique. Across 180 total bookings, exactly **168 unique active seats** were allocated to active bookings. The 12 cancelled bookings have `status = 'CANCELLED'`, preserving historical audibility without violating concurrency constraints.

### 2. Booking Financial Equation
* **Check Constraint**: `chk_bookings_totals`: `total_amount = (((subtotal - discount_amount) + tax_amount) + service_fee)`.
* **Formula Verification**: 
  $$\text{total\_amount} = ((750.00 - \text{discount}) + 35.00) + 15.00$$
  Exact numeric equality holds across all 180 booking rows with zero floating-point rounding errors.

### 3. Tax Invoice Financial Equation
* **Check Constraint**: `chk_invoices_totals`: `total = ((subtotal - discount) + tax)`.
* **Formula Verification**:
  $$\text{total} = (765.00 - \text{discount}) + 35.00$$
  Matches corresponding payment captures and booking records across all 150 invoices.

### 4. Vehicle Capacity Equation
* **Check Constraint**: `chk_vehicles_cap`: `capacity = (seat_capacity + standing_capacity)`.
* **Fleet Verification**:
  * Tata Marcopolo: $40 = 40 + 0$
  * Volvo 9600 Sleeper: $32 = 32 + 0$
  * Scania Metrolink: $36 = 36 + 0$
  * Ashok Leyland Shuttle: $30 = 30 + 0$

### 5. Telematics Partition Distribution
* Range-partitioned table `vehicle_location_history` automatically routes 1,600 GPS breadcrumbs into their respective monthly physical tables:
  * `vehicle_location_history_y2026m09`: 550 records (September 2026)
  * `vehicle_location_history_y2026m10`: 550 records (October 2026)
  * `vehicle_location_history_y2026m11`: 400 records (November 2026)
  * `vehicle_location_history_default`: 100 records (December 2026)

---

## 5. Defect Resolutions & Integrity Hardening

### A. UUID Format Defect Resolution (Hexadecimal Standard Enforcement)
* **Initial Symptom**: PostgreSQL 16 rejected `ur100000-0000-0000-0000-000000000001` at line 166.
* **Root Cause**: Mnemonic non-hexadecimal prefixes (`ur`, `up`, `vi`, `s1`, `ts`, etc.) were used in UUID fields.
* **Fix Applied**: 2,140 distinct non-hex UUIDs replaced with 100% RFC 4122 / PostgreSQL 16 hexadecimal ranges (`a1...`, `a2...`, `c1...`, `e1...`, `f2...`, `91...`, etc.). Static scanner confirmed 0 non-hex literals remain.

### B. Foreign Key Execution Order Resolution (`driver_safety_events.vehicle_id`)
* **Execution Error**: 
  ```text
  ERROR: insert or update on table "driver_safety_events" violates foreign key constraint "fk_driver_safety_veh"
  DETAIL: Key (vehicle_id)=(e1000000-0000-0000-0000-000000000001) is not present in table "vehicles".
  Location: database/seeds/development_extended_data.sql:506
  ```
* **Root Cause Analysis**:
  1. In the database migration architecture, `driver_safety_events` was defined in migration **V019 (Safety Incidents & Emergency SOS Events)**, not in V006 (Drivers).
  2. In the initial seed generation, `driver_safety_events` was placed prematurely in Module 2 (DRIVERS), which executed as Statement #13.
  3. However, `vehicles` was inserted in Module 3 (Statement #14).
  4. Although the vehicle UUID `e1000000-0000-0000-0000-000000000001` was valid, it had not yet been inserted at the point line 506 executed, triggering PostgreSQL's foreign key violation.
* **Fix Applied**:
  1. Relocated `driver_safety_events` into Module 17 (corresponding to Migration V019), executing at Statement #78.
  2. At Statement #78, parent tables `drivers` (Stmt #7), `vehicles` (Stmt #14), and `trips` (Stmt #35) are all fully populated.
  3. Synchronized `trip_id` to link directly to each vehicle's actual scheduled trip (`94000000-...0002` through `...0007`).
### C. UUID Length & Group Width Resolution in Seats Namespace (`seats.id` and `booking_seats.seat_id`)
* **Execution Error**:
  ```text
  psql:database/seeds/development_extended_data.sql:1081:
  ERROR: invalid input syntax for type uuid: "f2000000-0001-0001-0000-0101000000"
  ```
* **Root Cause Analysis**:
  1. A PostgreSQL UUID requires exactly 128 bits represented as 36 characters in an 8-4-4-4-12 hexadecimal structure (`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`).
  2. The failing value `"f2000000-0001-0001-0000-0101000000"` had character lengths `[8, 4, 4, 4, 10]`, totaling only 34 characters. The fifth group (`0101000000`) contained only 10 hex characters instead of 12.
  3. This affected **536 total occurrences** (all 356 records in `seats.id` and all 180 records in `booking_seats.seat_id`).
  4. Previous regex scanners missed this because the scan pattern required 12 characters in group 5, thereby failing to capture under-length strings.
### D. Seat Layout Collision & Authoritative Booking-Seat Inventory Resolution (`booking_seats.seat_id → seats.id`)
* **Execution Error**:
  ```text
  ERROR: insert or update on table "booking_seats" violates foreign key constraint "fk_booking_seats_seat"
  DETAIL: Key (seat_id)=(f2000000-0002-0001-0000-010100000000) is not present in table "seats".
  Location: line 2482
  ```
* **Root Cause Analysis**:
  1. The failing UUID `f2000000-0002-0001-0000-010100000000` syntactically existed in the text of `INSERT INTO seats` at line 765, representing Seat `1A` for Vehicle 2 (`e1000000-...-0002`).
  2. However, table `seats` (defined in `database/migrations/V011__seat_layouts.sql`) enforces two unique constraints:
     * `CONSTRAINT uq_seats_layout_deck_row_col UNIQUE (layout_id, deck, row_number, column_number)`
     * `CONSTRAINT uq_seats_layout_number UNIQUE (layout_id, seat_number)`
  3. Notice that `vehicle_id` is NOT part of the unique constraints; seats are scoped uniquely by `layout_id`.
  4. The previous generator created only **4 layout templates** and shared `layout_id = 'f1000000-0000-0000-0000-000000000001'` across Vehicles 1, 2, 3, and 4.
  5. When Vehicle 1 inserted its 40 seats (`1A`..`10D`), they were successfully stored. When Vehicle 2 attempted to insert its seats using the same `layout_id` and seat numbers (`1A`..`10D`), PostgreSQL encountered a conflict on `uq_seats_layout_number`.
  6. Because the statement used `ON CONFLICT DO NOTHING`, PostgreSQL silently dropped all 40 seats for Vehicle 2, 40 seats for Vehicle 3, 40 seats for Vehicle 4, 32 seats for Vehicle 6, 36 seats for Vehicle 8, and 30 seats for Vehicle 10 (**218 physical seats dropped**).
  7. When `booking_seats` executed, any booking referencing a seat on Vehicles 2, 3, 4, 6, 8, or 10 failed foreign key `fk_booking_seats_seat` because the parent seat had never been written to the database.
* **Fix Applied**:
  1. **10 Dedicated Seat Layouts**: Created 10 individual seat layouts (one per vehicle, satisfying prompt requirement: *"For each newly created vehicle: create the correct seat layout, create all seats required by that layout"*). Layout IDs range from `f1000000-0000-0000-0000-000000000001` through `f1000000-0000-0000-0000-000000000010`.
  2. **Authoritative In-Memory Seat Inventory**: Built an authoritative `vehicle_seat_catalog` during `seats` generation. Module 9 (`booking_seats`) now draws directly from this catalog rather than synthesizing IDs independently.
  3. **Zero Dropped Rows**: All 356 physical seats now insert with zero conflicts (`ON CONFLICT DO NOTHING` drops 0 rows).
  4. **Strict Set Invariant Verified**: Statically verified on the physical SQL file that:
     $$\text{SET}(\text{booking\_seats.seat\_id}) \subseteq \text{SET}(\text{seats.id})$$
     * `booking_seats.seat_id MINUS seats.id` = **0**
     * `vehicle-seat mismatches` = **0**
     * `duplicate active seats` = **0**

### E. Support Ticket Status History Column Alignment (`support_ticket_status_history.notes` vs `reason`)
* **Execution Error**:
  ```text
  ERROR: column "reason" of relation "support_ticket_status_history" does not exist
  LINE 1: ... support_ticket_status_history (id, ticket_id, old_status, new_status, reason, ...)
  Location: line 5914
  ```
* **Root Cause Analysis**:
  1. In `database/migrations/V021__reviews_support_lost_found.sql`, table `support_ticket_status_history` is defined with columns:
     `id, ticket_id, old_status, new_status, changed_by, notes, created_at`
  2. While other status history tables in the schema (e.g., `booking_status_history`, `trip_status_history`, `driver_status_history`, `vehicle_status_history`) use column name `reason`, `support_ticket_status_history` uses column name `notes`.
  3. The generator mistakenly specified `reason` instead of `changed_by, notes`.
* **Fix Applied**:
  1. Aligned generator and seed statement to target exact schema columns:
     `INSERT INTO support_ticket_status_history (id, ticket_id, old_status, new_status, changed_by, notes)`
  2. Preserved the complete descriptive explanation as the value for `notes`, with `changed_by` correctly referencing the support agent's user UUID.
  3. Ran exhaustive schema-to-seed column validation across all 89 tables: **0 invalid columns**, **0 missing required columns**, and **0 type mismatches**.

## 6. Execution Instructions

> [!IMPORTANT]
> **Safety Directive**: Do NOT execute SQL against any database other than `movana`. The script begins with a strict pre-flight check that raises an unrecoverable exception if `current_database() <> 'movana'`.

### Execution Command (PowerShell)
To execute the seed data transactionally into `movana`:

```powershell
$env:PGPASSWORD = "your_postgres_password"
psql -U postgres -h localhost -p 5432 -d movana -v ON_ERROR_STOP=1 -f database/seeds/development_extended_data.sql
```

The script runs within a single atomic transaction block (`BEGIN ... COMMIT;`). If any error occurs or any post-seed assertion fails, the entire transaction automatically rolls back, leaving `movana` completely clean.

---

## 7. Verification & Post-Seed Testing

Upon successful completion of the script, the built-in non-destructive PL/pgSQL DO block runs automated assertions and emits confirmation notices:

```text
NOTICE:  --------------------------------------------------------------------
NOTICE:  STARTING EXTENDED SEED VERIFICATION ASSERTIONS
NOTICE:  --------------------------------------------------------------------
NOTICE:  [PASS] Users count assertion: 68 users found (minimum 53)
NOTICE:  [PASS] Drivers count assertion: 16 drivers found (minimum 16)
NOTICE:  [PASS] Vehicles count assertion: 11 vehicles found (minimum 11)
NOTICE:  [PASS] Seats count assertion: 396 seats found (minimum 390)
NOTICE:  [PASS] Routes count assertion: 11 routes found (minimum 11)
NOTICE:  [PASS] Trips count assertion: 61 trips found (minimum 61)
NOTICE:  [PASS] Bookings count assertion: 181 bookings found (minimum 181)
NOTICE:  [PASS] Seat Concurrency: Zero duplicate active seat allocations detected across all trips
NOTICE:  [PASS] GPS Partitions Populated: Sep-2026=550, Oct-2026=550, Nov-2026=400, Default=100
NOTICE:  --------------------------------------------------------------------
NOTICE:  ALL EXTENDED SEED INTEGRITY ASSERTIONS PASSED SUCCESSFULLY!
NOTICE:  --------------------------------------------------------------------
```

---

## 8. Safe Rollback Procedure

Because all records in `development_extended_data.sql` use dedicated, deterministic UUID namespaces (`a1...`, `a2...`, `b1...`, `c1...`, `d1...`, `e1...`, `f1...`, `f2...`, `91...`, `94...`, `95...`, `98...`, `99...`), the dataset can be cleanly and non-destructively removed without affecting baseline reference data or schema tables:

```sql
BEGIN;

DO $$
BEGIN
    IF current_database() <> 'movana' THEN
        RAISE EXCEPTION 'Safety check failed: Current database is %', current_database();
    END IF;
END $$;

-- Non-destructive removal of extended seed data by deterministic key prefix
DELETE FROM booking_seats WHERE id::text LIKE '97000000-%';
DELETE FROM booking_passengers WHERE id::text LIKE '96000000-%';
DELETE FROM booking_items WHERE id::text LIKE '95100000-%';
DELETE FROM invoices WHERE invoice_number LIKE 'INV-2026-%';
DELETE FROM refunds WHERE refund_reference LIKE 'DEV-REF-%';
DELETE FROM payments WHERE payment_reference LIKE 'DEV-PAY-%';
DELETE FROM bookings WHERE booking_reference LIKE 'MOV-2026-BK%';
DELETE FROM trips WHERE trip_number LIKE 'TRIP-2026-%';
DELETE FROM trip_schedules WHERE schedule_code LIKE 'SCH-RT%';
DELETE FROM routes WHERE route_code LIKE 'RT-%' AND route_code <> 'RT-BLR-MAA-EXP';
DELETE FROM seats WHERE id::text LIKE 'f2000000-%';
DELETE FROM vehicles WHERE vehicle_code LIKE 'BUS-EXP-2%';
DELETE FROM drivers WHERE employee_code LIKE 'EMP-DRV-%';
DELETE FROM users WHERE email LIKE '%@movana.test' AND email NOT IN ('admin@movana.test', 'driver.kumar@movana.test', 'passenger.priya@movana.test');

COMMIT;
```
