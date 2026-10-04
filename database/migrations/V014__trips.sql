-- =============================================================================
-- MOVANA PLATFORM DATABASE MIGRATION
-- Migration: V014__trips.sql
-- Description: Actual trip executions, trip stops timeline, crew/bus assignments,
--              status transition logs, milestone events, and deferred FK linkages.
-- Database Engine: PostgreSQL 16
-- =============================================================================

BEGIN;

DO $$
BEGIN
    IF current_database() <> 'movana' THEN
        RAISE EXCEPTION 'CRITICAL: Migration must run strictly inside "movana" database. Current: %', current_database();
    END IF;
END $$;

-- 1. Master Scheduled Trips Table
CREATE TABLE IF NOT EXISTS trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_number VARCHAR(64) NOT NULL,
    route_id UUID NOT NULL,
    schedule_id UUID NULL,
    vehicle_id UUID NULL,
    primary_driver_id UUID NULL,
    secondary_driver_id UUID NULL,
    scheduled_departure_at TIMESTAMPTZ NOT NULL,
    scheduled_arrival_at TIMESTAMPTZ NOT NULL,
    actual_departure_at TIMESTAMPTZ NULL,
    actual_arrival_at TIMESTAMPTZ NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'SCHEDULED',
    current_stop_id UUID NULL,
    current_latitude NUMERIC(10,7) NULL,
    current_longitude NUMERIC(10,7) NULL,
    delay_minutes INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_trips_route FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE RESTRICT,
    CONSTRAINT fk_trips_schedule FOREIGN KEY (schedule_id) REFERENCES trip_schedules(id) ON DELETE SET NULL,
    CONSTRAINT fk_trips_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL,
    CONSTRAINT fk_trips_driver1 FOREIGN KEY (primary_driver_id) REFERENCES drivers(id) ON DELETE RESTRICT,
    CONSTRAINT fk_trips_driver2 FOREIGN KEY (secondary_driver_id) REFERENCES drivers(id) ON DELETE RESTRICT,
    CONSTRAINT fk_trips_stop FOREIGN KEY (current_stop_id) REFERENCES stops(id) ON DELETE SET NULL,
    CONSTRAINT uq_trips_number UNIQUE (trip_number),
    CONSTRAINT chk_trips_sched_times CHECK (scheduled_arrival_at > scheduled_departure_at),
    CONSTRAINT chk_trips_status CHECK (status IN ('SCHEDULED', 'BOARDING', 'DEPARTED', 'IN_TRANSIT', 'DELAYED', 'ARRIVED', 'COMPLETED', 'CANCELLED', 'SUSPENDED')),
    CONSTRAINT chk_trips_diff_drivers CHECK (primary_driver_id IS NULL OR secondary_driver_id IS NULL OR primary_driver_id <> secondary_driver_id)
);

CREATE INDEX IF NOT EXISTS idx_trips_route_departure ON trips (route_id, scheduled_departure_at);
CREATE INDEX IF NOT EXISTS idx_trips_status ON trips(status);
CREATE INDEX IF NOT EXISTS idx_trips_vehicle ON trips(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_trips_driver ON trips(primary_driver_id);

CREATE TRIGGER trg_trips_updated_at
BEFORE UPDATE ON trips
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- 2. Trip Stops Progress Timeline
CREATE TABLE IF NOT EXISTS trip_stops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL,
    stop_id UUID NOT NULL,
    sequence_number INTEGER NOT NULL,
    scheduled_arrival_at TIMESTAMPTZ NOT NULL,
    scheduled_departure_at TIMESTAMPTZ NOT NULL,
    actual_arrival_at TIMESTAMPTZ NULL,
    actual_departure_at TIMESTAMPTZ NULL,
    delay_minutes INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_trip_stops_trip FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
    CONSTRAINT fk_trip_stops_stop FOREIGN KEY (stop_id) REFERENCES stops(id) ON DELETE RESTRICT,
    CONSTRAINT uq_trip_stops_trip_seq UNIQUE (trip_id, sequence_number),
    CONSTRAINT uq_trip_stops_trip_stop UNIQUE (trip_id, stop_id),
    CONSTRAINT chk_trip_stops_sched CHECK (scheduled_departure_at >= scheduled_arrival_at),
    CONSTRAINT chk_trip_stops_status CHECK (status IN ('PENDING', 'ARRIVED', 'DEPARTED', 'SKIPPED'))
);

CREATE INDEX IF NOT EXISTS idx_trip_stops_trip ON trip_stops(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_stops_stop ON trip_stops(stop_id);

CREATE TRIGGER trg_trip_stops_updated_at
BEFORE UPDATE ON trip_stops
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- 3. Trip Operational Assignments
CREATE TABLE IF NOT EXISTS trip_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL,
    driver_id UUID NOT NULL,
    vehicle_id UUID NOT NULL,
    assignment_type VARCHAR(32) NOT NULL DEFAULT 'PRIMARY_DRIVER',
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_trip_assign_trip FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
    CONSTRAINT fk_trip_assign_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE RESTRICT,
    CONSTRAINT fk_trip_assign_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_trip_assign_trip ON trip_assignments(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_assign_driver ON trip_assignments(driver_id);

CREATE TRIGGER trg_trip_assign_updated_at
BEFORE UPDATE ON trip_assignments
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- 4. Trip Status History Log
CREATE TABLE IF NOT EXISTS trip_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL,
    old_status VARCHAR(32) NOT NULL,
    new_status VARCHAR(32) NOT NULL,
    reason TEXT NULL,
    changed_by UUID NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_trip_status_hist_trip FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
    CONSTRAINT fk_trip_status_hist_user FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_trip_status_hist_trip ON trip_status_history (trip_id, created_at DESC);

-- 5. Trip Milestone Events Log
CREATE TABLE IF NOT EXISTS trip_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL,
    vehicle_id UUID NULL,
    driver_id UUID NULL,
    event_type VARCHAR(64) NOT NULL,
    event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_trip_events_trip FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
    CONSTRAINT fk_trip_events_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL,
    CONSTRAINT fk_trip_events_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_trip_events_trip ON trip_events (trip_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_trip_events_type ON trip_events(event_type);

-- Resolve deferred FKs to trips
ALTER TABLE driver_assignments
ADD CONSTRAINT fk_driver_assign_trip FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE SET NULL;

ALTER TABLE vehicle_assignments
ADD CONSTRAINT fk_vehicle_assign_trip FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE SET NULL;

ALTER TABLE vehicle_inspections
ADD CONSTRAINT fk_vehicle_insp_trip FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE SET NULL;

-- Record migration
INSERT INTO schema_migrations (version, description, script, execution_time_ms, success)
VALUES ('V014', 'trips', 'V014__trips.sql', 0, TRUE)
ON CONFLICT (version) DO NOTHING;

COMMIT;
