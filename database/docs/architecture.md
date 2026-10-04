# Movana — Database Architecture & Engineering Design

## 1. Executive Architectural Blueprint

**Movana** is an enterprise-scale relational database engineered for high-concurrency bus transportation networks. The platform manages complex passenger bookings, dynamic route topologies, time-sensitive schedules, real-time fleet GPS tracking, maintenance lifecycles, driver compliance, financial transactions, and safety incidents.

The data layer is built on **PostgreSQL 16**, serving as the single authoritative, durable, and auditable system of record.

```
                              ┌──────────────────────────────────────┐
                              │     Client Applications / Gateways   │
                              │  (Passenger App, Driver App, Admin)  │
                              └──────────────────┬───────────────────┘
                                                 │ HTTPS / WSS
                                                 ▼
                              ┌──────────────────────────────────────┐
                              │        Backend API Services          │
                              └───────────┬──────────────┬───────────┘
                                          │              │
                   High-frequency writes  │              │ Durable queries
                   & ephemeral caching    │              │ & financial transactions
                                          ▼              ▼
                    ┌─────────────────────────┐   ┌───────────────────────────────┐
                    │     Redis 7 (Cache)     │   │   PostgreSQL 16 (Persistence) │
                    │ ─────────────────────── │   │ ───────────────────────────── │
                    │ • Current GPS ping      │   │ • Historical Telemetry        │
                    │ • Driver active status  │   │ • Route & Schedule Topology   │
                    │ • Live seat lock token  │   │ • Confirmed Bookings & Seats  │
                    │ • Ephemeral sessions    │   │ • Financials (Invoices/Refunds)│
                    │ • Real-time pub/sub     │   │ • Auditing & Safety Records   │
                    └─────────────────────────┘   └───────────────────────────────┘
```

---

## 2. Core Architectural Principles

### 2.1 The Authoritative Persistent Store vs. In-Memory Cache
* **PostgreSQL 16** is the **sole source of truth**. Every business state transition (booking confirmation, payment capture, driver assignment, trip departure, maintenance signoff) must be permanently, transactionally committed to PostgreSQL.
* **Redis** is deployed strictly as an ephemeral accelerator:
  * Ingestion of raw GPS telemetry pings before micro-batching into PostgreSQL.
  * Real-time geospatial lookup of currently moving vehicles for end-user maps.
  * Short-lived distributed locks during the multi-second checkout window before final SQL transaction commit.
* **Failure Tolerance**: If Redis restarts or drops cache, PostgreSQL contains 100% of historical and configuration data required to restore the entire platform state.

### 2.2 Relational Integrity & Zero Data Loss
* **No Premature JSONB Monoliths**: Core domain entities (users, routes, stops, schedules, trips, seats, bookings, payments) are modeled with strictly typed relational columns, foreign key constraints, and check constraints.
* **Targeted JSONB Usage**: JSONB is used strictly where schema variance is native to the domain:
  * `audit_logs.old_values` & `audit_logs.new_values`
  * `payments.provider_metadata` & `payment_events.payload`
  * `trip_events.event_data` & `driver_safety_events.event_data`
  * `system_settings.setting_value` & `feature_flags.target_rules`
* **Zero Casual Deletion**: All operational tables implement soft deletion (`deleted_at TIMESTAMPTZ`) where entities may be deactivated. Transactional tables (payments, refunds, bookings, invoices, audit logs, safety reports, inspection logs) are **strictly immutable** and cannot be deleted.

---

## 3. Concurrency & Seat Booking Protection

### 3.1 The Double-Booking Hazard
In high-demand transportation environments, hundreds of passengers may attempt to select and pay for the same seats (e.g. window seats on high-traffic festival routes) simultaneously.

### 3.2 Multi-Layer Concurrency Defense
Movana utilizes a three-tier defense model:

1. **Short-Term Temporary Hold (Redis TTL Lock)**:
   * When a passenger initiates checkout, a 10-minute lock key is acquired in Redis: `trip:{trip_id}:seat:{seat_id}:hold`.
2. **Pessimistic Row Locking during Finalization (PostgreSQL)**:
   * When the payment succeeds and the booking finalization transaction executes, PostgreSQL issues:
     ```sql
     SELECT id, status FROM booking_seats 
     WHERE trip_id = $1 AND seat_id = $2 
     FOR UPDATE;
     ```
3. **Database-Level Unique Exclusion Constraint**:
   * A partial unique index guarantees that no two active (non-cancelled) bookings can claim the same seat on the same trip:
     ```sql
     CREATE UNIQUE INDEX uq_booking_seats_active_trip_seat
     ON booking_seats (trip_id, seat_id)
     WHERE (status IN ('PENDING', 'CONFIRMED'));
     ```
   * Even under arbitrary race conditions or split-brain application server behavior, the database engine physically rejects duplicate assignments with a constraint violation (`23505`).

---

## 4. Financial Integrity & Price Reproducibility

### 4.1 Historical Immutability
* Fares, route distances, tax rates, and fuel surcharges evolve continuously. 
* Under no circumstances is a past booking's total recalculated dynamically from live pricing tables.
* At the moment of checkout, **complete snapshots** of:
  * Unit base fare
  * Distance-based charge
  * Taxes and service fees
  * Discount and promotional deductions
  are written into `bookings`, `booking_items`, `booking_seats`, and `invoices`.
* An invoice issued in 2024 remains historically verifiable with zero drift regardless of 2026 pricing updates.

### 4.2 Webhook Idempotency & Payment State Machine
* External payment providers (Stripe, Razorpay, Adyen) fire webhooks asynchronously, often repeating payloads during network blips.
* The `payment_events` table enforces unique tracking on `(provider, event_id)`.
* Inbound duplicate webhooks are immediately recognized as idempotent duplicates and bypassed before executing any state transitions.
* Payment states follow a strict non-reversible state machine:
  `INITIATED` ➔ `PENDING` ➔ `AUTHORIZED` ➔ `CAPTURED` ➔ (`REFUNDED` | `PARTIALLY_REFUNDED`).

---

## 5. Telemetry & Geospatial Architecture

### 5.1 Coordinate Precision
* Coordinate fields (`latitude`, `longitude`) are typed as `NUMERIC(10, 7)`.
* This ensures precision down to ~1.1 centimeters on Earth's surface without IEEE 754 floating point rounding drift.
* Latitude is bounded: `CHECK (latitude >= -90.0 AND latitude <= 90.0)`
* Longitude is bounded: `CHECK (longitude >= -180.0 AND longitude <= 180.0)`

### 5.2 Decoupling Current State from Historical Telemetry
* Fleet dashboards require sub-millisecond lookups for "Where is Bus X right now?".
* Querying millions of historical breadcrumbs for current location is an anti-pattern.
* Therefore:
  * `vehicles.current_latitude`, `vehicles.current_longitude`, and `vehicles.last_location_at` provide immediate O(1) reads for live dispatchers.
  * `vehicle_location_history` stores the append-only time-series stream partitioned by monthly intervals (`recorded_at`).

---

## 6. Security, RBAC & Privacy Compliance

### 6.1 Role-Based Access Control (RBAC)
* Normalized 4-table RBAC model: `roles`, `permissions`, `user_roles`, `role_permissions`.
* Supports system roles: `PASSENGER`, `DRIVER`, `ADMIN`, `OPERATOR`, `SUPPORT_AGENT`, `SAFETY_OFFICER`, `FLEET_MANAGER`, `FINANCE_MANAGER`.

### 6.2 Zero-Knowledge Payment Credential Storage
* The database stores **zero** raw credit card numbers, CVVs, or cardholder PINs.
* Card representations are strictly stored as tokenized payment references (`payment_methods.provider_token`) alongside masked display references (e.g. `masked_account_number = '•••• 4242'`).

### 6.3 PII and Passenger Privacy
* Passengers' government IDs are stored exclusively as `id_type` and `id_last4`.
* Binary scans and driver document files are stored in external encrypted cloud storage (S3/GCS); PostgreSQL stores only metadata, access keys, and SHA-256 integrity checksums in `file_attachments`.
