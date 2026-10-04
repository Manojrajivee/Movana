# Movana Database Engineering & Deployment Guide

This directory contains the complete, authoritative, and reproducible PostgreSQL 16 database implementation for the **Movana** transportation platform.

---

## 🛡️ Critical Safety Notice

The local PostgreSQL instance hosts multiple independent production databases. Under no circumstances should any developer, automated runner, or script execute modifications against any database other than **`movana`**.

The following target databases are strictly protected:
* `chatbot_db`
* `cyber_investigation`
* `dayflow`
* `localhero`
* `localhero_db`
* `maritime_m3_db`
* `skillbridge_ai`
* `movana_db` (legacy/isolated)
* `postgres`

**All Movana database migrations, seeds, and test suites must strictly run inside `movana`.**

---

## 🚀 Creating a Fresh Movana Database from Scratch

Follow this standard procedure to stand up the complete Movana database from an empty PostgreSQL 16 instance.

### Step 1: Pre-Flight Verification
Verify that PostgreSQL 16 is running and assert connection to `movana`:
```powershell
powershell -ExecutionPolicy Bypass -File scripts/database/verify_connection.ps1
```
Or via `psql`:
```powershell
psql -U postgres -h localhost -p 5432 -d movana -w -c "SELECT current_database(), current_schema(), version();"
```

### Step 2: Sequential Migration Execution
Execute each migration in strict numeric sequence (`V001` through `V024`). Every migration is individually atomic (`BEGIN ... COMMIT`) and records its execution inside `schema_migrations`.

#### Automated PowerShell Runner:
```powershell
Get-ChildItem database/migrations/*.sql | Sort-Object Name | ForEach-Object {
    Write-Host "Applying $($_.Name)..." -ForegroundColor Cyan
    psql -U postgres -h localhost -p 5432 -d movana -w -f $_.FullName
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Migration failed on $($_.Name)" -ForegroundColor Red
        exit 1
    }
}
Write-Host "All 24 migrations applied successfully!" -ForegroundColor Green
```

#### Manual psql Execution:
```powershell
psql -U postgres -h localhost -p 5432 -d movana -f database/migrations/V001__extensions.sql
psql -U postgres -h localhost -p 5432 -d movana -f database/migrations/V002__users.sql
psql -U postgres -h localhost -p 5432 -d movana -f database/migrations/V003__roles_permissions.sql
psql -U postgres -h localhost -p 5432 -d movana -f database/migrations/V004__passenger_profiles.sql
psql -U postgres -h localhost -p 5432 -d movana -f database/migrations/V005__emergency_contacts.sql
psql -U postgres -h localhost -p 5432 -d movana -f database/migrations/V006__drivers.sql
psql -U postgres -h localhost -p 5432 -d movana -f database/migrations/V007__driver_documents.sql
psql -U postgres -h localhost -p 5432 -d movana -f database/migrations/V008__vehicles.sql
psql -U postgres -h localhost -p 5432 -d movana -f database/migrations/V009__vehicle_documents.sql
psql -U postgres -h localhost -p 5432 -d movana -f database/migrations/V010__vehicle_maintenance.sql
psql -U postgres -h localhost -p 5432 -d movana -f database/migrations/V011__seat_layouts.sql
psql -U postgres -h localhost -p 5432 -d movana -f database/migrations/V012__routes_stops.sql
psql -U postgres -h localhost -p 5432 -d movana -f database/migrations/V013__schedules_calendars.sql
psql -U postgres -h localhost -p 5432 -d movana -f database/migrations/V014__trips.sql
psql -U postgres -h localhost -p 5432 -d movana -f database/migrations/V015__bookings.sql
psql -U postgres -h localhost -p 5432 -d movana -f database/migrations/V016__fares_pricing.sql
psql -U postgres -h localhost -p 5432 -d movana -f database/migrations/V017__payments_refunds.sql
psql -U postgres -h localhost -p 5432 -d movana -f database/migrations/V018__gps_tracking.sql
psql -U postgres -h localhost -p 5432 -d movana -f database/migrations/V019__safety_incidents.sql
psql -U postgres -h localhost -p 5432 -d movana -f database/migrations/V020__notifications.sql
psql -U postgres -h localhost -p 5432 -d movana -f database/migrations/V021__reviews_support_lost_found.sql
psql -U postgres -h localhost -p 5432 -d movana -f database/migrations/V022__audit_security.sql
psql -U postgres -h localhost -p 5432 -d movana -f database/migrations/V023__settings_attachments.sql
psql -U postgres -h localhost -p 5432 -d movana -f database/migrations/V024__views.sql
```

---

### Step 3: Seed Reference & Development Data

#### 1. Reference Data (System Roles, Permissions, Document Types, Settings):
```powershell
psql -U postgres -h localhost -p 5432 -d movana -f database/seeds/reference_data.sql
```

#### 2. Development Data (Demo Routes, Buses, Drivers, Sample Bookings):
```powershell
psql -U postgres -h localhost -p 5432 -d movana -f database/seeds/development_data.sql
```

---

### Step 4: Run Automated Integrity Test Suite
Verify that all foreign keys, check constraints, seat concurrency protection, payment idempotency, and views are operating correctly:
```powershell
psql -U postgres -h localhost -p 5432 -d movana -f database/tests/database_integrity.sql
```
*Note*: The test suite executes inside an isolated transaction and automatically rolls back upon completion, leaving test data unpolluted.

---

## 🔒 Production Role Configuration (Least Privilege)

In production, avoid connecting the application backend as the PostgreSQL superuser. Configure dedicated conceptual roles:

```sql
-- 1. Schema Migration Owner (Full DDL rights)
CREATE ROLE movana_owner WITH LOGIN PASSWORD 'strong_owner_password';
GRANT ALL PRIVILEGES ON DATABASE movana TO movana_owner;
GRANT ALL ON SCHEMA public TO movana_owner;

-- 2. Application Runtime User (DML rights only)
CREATE ROLE movana_app WITH LOGIN PASSWORD 'strong_app_password';
GRANT CONNECT ON DATABASE movana TO movana_app;
GRANT USAGE ON SCHEMA public TO movana_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO movana_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO movana_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO movana_app;

-- 3. Read-Only Analytics User (SELECT on tables and views)
CREATE ROLE movana_readonly WITH LOGIN PASSWORD 'strong_readonly_password';
GRANT CONNECT ON DATABASE movana TO movana_readonly;
GRANT USAGE ON SCHEMA public TO movana_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO movana_readonly;
```

---

## 📁 Migration Inventory

| Migration File | Domain | Summary of Responsibilities |
| :--- | :--- | :--- |
| `V001__extensions.sql` | Foundation | `pgcrypto`, `btree_gist`, `citext`, `schema_migrations`, `fn_set_updated_at` |
| `V002__users.sql` | Identity & Auth | `users`, `user_sessions`, `login_attempts`, `security_events`, tokens |
| `V003__roles_permissions.sql` | RBAC | `roles`, `permissions`, `user_roles`, `role_permissions` |
| `V004__passenger_profiles.sql` | Profiles | `passenger_profiles`, `user_preferences` |
| `V005__emergency_contacts.sql` | Contacts & Address| `emergency_contacts`, `user_addresses` |
| `V006__drivers.sql` | Driver Compliance | `drivers`, `driver_availability`, `driver_status_history`, `driver_assignments` |
| `V007__driver_documents.sql` | Compliance Files | `driver_document_types`, `driver_documents`, `driver_verifications` |
| `V008__vehicles.sql` | Bus Fleet | `vehicle_manufacturers`, `models`, `types`, `vehicles`, `vehicle_assignments` |
| `V009__vehicle_documents.sql` | Bus Compliance | `vehicle_documents` (fitness, permit, RC, insurance) |
| `V010__vehicle_maintenance.sql`| Garage Operations | `maintenance_schedules`, `records`, `items`, `parts`, `vehicle_inspections` |
| `V011__seat_layouts.sql` | Seating Grids | `seat_layouts`, `seats` (decks, window/aisle, types) |
| `V012__routes_stops.sql` | Transit Network | `stops`, `routes`, `route_versions`, `route_stops` |
| `V013__schedules_calendars.sql`| Service Timetables| `service_calendars`, `exceptions`, `trip_schedules`, `schedule_stops` |
| `V014__trips.sql` | Trip Operations | `trips`, `trip_stops`, `trip_assignments`, `trip_status_history`, `trip_events` |
| `V015__bookings.sql` | Reservations | `bookings`, `booking_passengers`, `booking_items`, `booking_seats`, cancellations |
| `V016__fares_pricing.sql` | Fares & Discounts | `fare_products`, `fare_rules`, `fare_prices`, `trip_fares`, `discounts`, `coupons` |
| `V017__payments_refunds.sql` | Financial Ledger | `payment_methods`, `payments`, `payment_events`, `refunds`, `invoices`, items |
| `V018__gps_tracking.sql` | Telemetry & Fences| `tracking_devices`, `vehicle_location_history` (partitioned), `geofences` |
| `V019__safety_incidents.sql` | Safety & SOS | `incidents`, `incident_reports`, `emergency_events`, `driver_safety_events` |
| `V020__notifications.sql` | Communications | `notification_templates`, `preferences`, `notifications`, `deliveries` |
| `V021__reviews_support_lost_found.sql`| Customer Care| `reviews`, `responses`, `support_tickets`, messages, `lost_found_reports` |
| `V022__audit_security.sql` | Audit Trail | `audit_logs`, `fn_record_audit_log`, `fn_generate_booking_reference`, triggers |
| `V023__settings_attachments.sql`| Config & Files | `file_attachments`, `system_settings`, `feature_flags` |
| `V024__views.sql` | Analytical Views | 8 Reporting projections (`vw_available_trip_seats`, `vw_trip_current_status`...) |
