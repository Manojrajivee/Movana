# Movana Database Indexing Strategy & Query Optimization

This document outlines the indexing architecture for the **Movana** platform. Indexes are engineered based on real-world access patterns to maximize throughput, enforce integrity constraints, eliminate sequential scans on high-traffic paths, and prevent index bloat on append-heavy telemetry tables.

---

## 1. Indexing Principles & Categorization

1. **Foreign Key Indexing**: Every single foreign key subject to JOIN operations or parent lookup must have a dedicated index to prevent table-level locking during CASCADE or RESTRICT checks.
2. **Partial Indexes for Concurrency & State Filtering**:
   * Saves storage and reduces memory footprint by indexing only active rows.
   * Enforces conditional uniqueness (e.g., active seat reservations).
3. **Composite Indexes for Time-Series & Query Ordering**:
   * Multi-column indexes engineered to satisfy query filtering and sorting simultaneously without an extra in-memory sort pass (e.g. `(vehicle_id, recorded_at DESC)`).
4. **Lean Indexing on Write-Heavy Tables**:
   * Telemetry breadcrumbs (`vehicle_location_history`) and notification dispatches write thousands of rows per minute. Indexes on these tables are kept to the absolute bare minimum required for fleet queries.

---

## 2. High-Impact Index Catalog

### 2.1 Concurrency & Uniqueness Protection Indexes

| Index Name | Target Table | Columns / Expressions | Filter / Condition | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `uq_booking_seats_active_trip_seat` | `booking_seats` | `(trip_id, seat_id)` | `WHERE status IN ('PENDING', 'CONFIRMED')` | **Critical Concurrency Shield**: Physically prevents two active reservations on the same seat. |
| `uq_users_email_active` | `users` | `LOWER(email)` | `WHERE deleted_at IS NULL` | Case-insensitive email uniqueness while permitting re-registration of soft-deleted accounts. |
| `uq_users_phone_active` | `users` | `phone` | `WHERE deleted_at IS NULL AND phone IS NOT NULL` | Uniqueness for mobile login. |
| `uq_tracking_devices_active_veh` | `tracking_devices` | `vehicle_id` | `WHERE is_active IS TRUE AND vehicle_id IS NOT NULL` | Guarantees only one active GPS device per bus. |
| `idx_vehicles_reg_num` | `vehicles` | `registration_number` | - | O(1) fleet lookup by license plate. |
| `idx_bookings_ref` | `bookings` | `booking_reference` | - | High-frequency PNR / ticket verification lookup. |
| `idx_payments_ref` | `payments` | `payment_reference` | - | Gateway reconciliation key. |
| `idx_payments_provider_tx` | `payments` | `provider_transaction_id` | - | Webhook matching. |

---

### 2.2 Time-Series & Telemetry Composite Indexes

| Index Name | Target Table | Columns | Operational Query Satisfied |
| :--- | :--- | :--- | :--- |
| `idx_loc_hist_veh_time` | `vehicle_location_history` | `(vehicle_id, recorded_at DESC)` | "Show the playback path of Bus X for the past 4 hours." |
| `idx_loc_hist_trip_time` | `vehicle_location_history` | `(trip_id, recorded_at DESC)` | "Audit trip speed profile and route deviations." |
| `idx_trips_route_departure` | `trips` | `(route_id, scheduled_departure_at)` | "Find all upcoming bus departures between City A and City B for date X." |
| `idx_bookings_user_time` | `bookings` | `(user_id, booked_at DESC)` | "Passenger 'My Trips' order history list." |
| `idx_audit_logs_entity` | `audit_logs` | `(entity_type, entity_id)` | "Fetch complete change history for Booking/Vehicle/Driver X." |
| `idx_audit_logs_time` | `audit_logs` | `created_at DESC` | "System security timeline audit stream." |
| `idx_driver_safety_driver_time` | `driver_safety_events` | `(driver_id, occurred_at DESC)` | "Driver safety scorecard and harsh-braking evaluation." |

---

### 2.3 Operational Queue & Filter Indexes

| Index Name | Target Table | Columns / Expressions | Filter / Condition | Operational Benefit |
| :--- | :--- | :--- | :--- | :--- |
| `idx_notifications_queue` | `notifications` | `(status, scheduled_for)` | `WHERE status = 'QUEUED'` | High-speed worker polling without scanning historical notifications. |
| `idx_notifications_unread` | `notifications` | `user_id` | `WHERE read_at IS NULL` | Sub-millisecond unread badge counter for mobile apps. |
| `idx_emergency_active` | `emergency_events` | `status` | `WHERE status = 'TRIGGERED'` | High-priority SOS dispatcher dashboard monitor. |
| `idx_trips_active_status` | `trips` | `status` | `WHERE status IN ('BOARDING', 'IN_TRANSIT', 'DELAYED')` | Real-time transit monitoring and ETA calculation engine. |

---

## 3. High-Volume Query Optimization Patterns

### Pattern A: Trip Search by Route & Date
```sql
-- Query
SELECT id, trip_number, scheduled_departure_at, scheduled_arrival_at, status
FROM trips
WHERE route_id = $1 
  AND scheduled_departure_at >= $2 
  AND scheduled_departure_at < $3
ORDER BY scheduled_departure_at ASC;

-- Optimization: Satisfied via idx_trips_route_departure via Index Scan
```

### Pattern B: Real-Time Seat Map Generation
```sql
-- Query
SELECT s.id, s.seat_number, s.deck, s.row_number, s.column_number, s.seat_type,
       bs.status AS booking_status
FROM seats s
LEFT JOIN booking_seats bs ON s.id = bs.seat_id 
  AND bs.trip_id = $1 
  AND bs.status IN ('PENDING', 'CONFIRMED')
WHERE s.vehicle_id = $2 AND s.is_active = TRUE;

-- Optimization: Satisfied via idx_seats_vehicle and uq_booking_seats_active_trip_seat
```

### Pattern C: Fleet Live Positioning Feed
```sql
-- Query
SELECT v.id, v.vehicle_code, v.registration_number, 
       v.current_latitude, v.current_longitude, v.last_location_at
FROM vehicles v
WHERE v.status = 'ACTIVE' 
  AND v.current_latitude IS NOT NULL;

-- Optimization: Satisfied via idx_vehicles_loc partial index
```
