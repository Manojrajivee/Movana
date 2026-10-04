# Movana Data Retention, Archival & Partitioning Policy

This document defines the data lifecycle, partitioning architecture, and legal retention mandates for the **Movana** platform.

---

## 1. Data Retention Tiers

| Data Domain | Representative Tables | Retention Classification | Active Window | Archival Action |
| :--- | :--- | :---: | :---: | :--- |
| **Financial & Accounting** | `payments`, `refunds`, `invoices`, `invoice_items` | **Permanent / Statutory** | 8+ Years | Never expunged. Replicated to write-once-read-many (WORM) audit storage. |
| **Passenger Bookings** | `bookings`, `booking_passengers`, `booking_seats` | **Permanent / Auditable** | 7 Years | Kept in relational storage for passenger history and dispute reconciliation. |
| **Safety & Incidents** | `incidents`, `incident_reports`, `emergency_events` | **Permanent / Compliance**| Permanent | Preserved for regulatory compliance and insurance liability investigations. |
| **Fleet Asset History** | `vehicles`, `maintenance_records`, `inspections` | **Permanent** | Vehicle Life | Retained for total cost of ownership (TCO) and warranty tracking. |
| **Audit Logs** | `audit_logs` | **Regulatory Compliance** | 7 Years | Append-only. Compressed and moved to cold storage after 2 years. |
| **GPS Telemetry** | `vehicle_location_history`, `tracking_events` | **High-Volume Time-Series** | 90 Days Hot Tier | Monthly range partitioned; exported to columnar Parquet format in object storage. |
| **Communications** | `notifications`, `notification_deliveries` | **Operational Ephemeral** | 1 Year | Retained for delivery audits; pruned past 365 days. |
| **User Security Sessions** | `user_sessions`, `password_reset_tokens` | **Transient Ephemeral** | 90 Days | Pruned automatically after expiration or revocation. |

---

## 2. GPS Telemetry Partitioning Architecture

### 2.1 The High-Throughput Challenge
A fleet of 500 active buses transmitting coordinates every 5 seconds generates:
* 100 coordinates/second
* 6,000 records/minute
* 360,000 records/hour
* **~8.6 million rows per day (~260 million rows per month)**

### 2.2 Monthly Range Partitioning
The table `vehicle_location_history` is configured using PostgreSQL declarative range partitioning based on `recorded_at`:

```sql
CREATE TABLE vehicle_location_history (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    vehicle_id UUID NOT NULL,
    trip_id UUID NULL,
    driver_id UUID NULL,
    latitude NUMERIC(10,7) NOT NULL,
    longitude NUMERIC(10,7) NOT NULL,
    accuracy_meters NUMERIC(6,2),
    speed_kmh NUMERIC(6,2) NOT NULL DEFAULT 0.00,
    heading_degrees NUMERIC(5,2),
    altitude_meters NUMERIC(7,2),
    odometer NUMERIC(10,2),
    recorded_at TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    source VARCHAR(32) NOT NULL DEFAULT 'GPS_DEVICE',
    PRIMARY KEY (id, recorded_at)
) PARTITION BY RANGE (recorded_at);
```

### 2.3 Partition Lifecycle & Detachment
* Each month has a dedicated partition (e.g. `vehicle_location_history_y2026m09`).
* Indexes exist locally on each partition, preventing global index bloat.
* After 90 days, older partitions are detached cleanly via:
  ```sql
  ALTER TABLE vehicle_location_history DETACH PARTITION vehicle_location_history_y2026m06;
  ```
* The detached table is exported to Apache Parquet files in cold storage (AWS S3 Glacier or Google Cloud Storage) for analytical queries via DuckDB / Athena, then dropped from the operational OLTP database with zero lock contention.
