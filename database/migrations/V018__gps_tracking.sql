-- =============================================================================
-- MOVANA PLATFORM DATABASE MIGRATION
-- Migration: V018__gps_tracking.sql
-- Description: Telematics hardware tracking units, partitioned historical GPS
--              breadcrumbs, diagnostic telemetry events, geofencing perimeters,
--              and automated boundary transition events.
-- Database Engine: PostgreSQL 16
-- =============================================================================

BEGIN;

DO $$
BEGIN
    IF current_database() <> 'movana' THEN
        RAISE EXCEPTION 'CRITICAL: Migration must run strictly inside "movana" database. Current: %', current_database();
    END IF;
END $$;

-- 1. Hardware GPS Telematics Devices
CREATE TABLE IF NOT EXISTS tracking_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_imei VARCHAR(32) NOT NULL,
    device_model VARCHAR(50) NOT NULL,
    firmware_version VARCHAR(32) NULL,
    vehicle_id UUID NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    installed_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tracking_dev_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL,
    CONSTRAINT uq_tracking_devices_imei UNIQUE (device_imei)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tracking_devices_active_veh
ON tracking_devices(vehicle_id)
WHERE is_active IS TRUE AND vehicle_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tracking_devices_imei ON tracking_devices(device_imei);
CREATE INDEX IF NOT EXISTS idx_tracking_devices_vehicle ON tracking_devices(vehicle_id);

CREATE TRIGGER trg_tracking_devices_updated_at
BEFORE UPDATE ON tracking_devices
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- 2. Master Historical GPS Telemetry (Declarative Range Partitioned by Month)
CREATE TABLE IF NOT EXISTS vehicle_location_history (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    vehicle_id UUID NOT NULL,
    trip_id UUID NULL,
    driver_id UUID NULL,
    latitude NUMERIC(10,7) NOT NULL,
    longitude NUMERIC(10,7) NOT NULL,
    accuracy_meters NUMERIC(6,2) NULL,
    speed_kmh NUMERIC(6,2) NOT NULL DEFAULT 0.00,
    heading_degrees NUMERIC(5,2) NULL,
    altitude_meters NUMERIC(7,2) NULL,
    odometer NUMERIC(10,2) NULL,
    recorded_at TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    source VARCHAR(32) NOT NULL DEFAULT 'GPS_DEVICE',
    CONSTRAINT fk_loc_hist_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE RESTRICT,
    CONSTRAINT fk_loc_hist_trip FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE SET NULL,
    CONSTRAINT fk_loc_hist_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL,
    CONSTRAINT chk_loc_hist_lat CHECK (latitude BETWEEN -90.0 AND 90.0),
    CONSTRAINT chk_loc_hist_lon CHECK (longitude BETWEEN -180.0 AND 180.0),
    CONSTRAINT chk_loc_hist_speed CHECK (speed_kmh >= 0.00),
    PRIMARY KEY (id, recorded_at)
) PARTITION BY RANGE (recorded_at);

-- Partition 2a: Default Fallback Partition (Prevents unrouted insertion crashes)
CREATE TABLE IF NOT EXISTS vehicle_location_history_default
PARTITION OF vehicle_location_history DEFAULT;

-- Partition 2b: September 2026 Monthly Partition
CREATE TABLE IF NOT EXISTS vehicle_location_history_y2026m09
PARTITION OF vehicle_location_history
FOR VALUES FROM ('2026-09-01 00:00:00+00') TO ('2026-10-01 00:00:00+00');

-- Partition 2c: October 2026 Monthly Partition
CREATE TABLE IF NOT EXISTS vehicle_location_history_y2026m10
PARTITION OF vehicle_location_history
FOR VALUES FROM ('2026-10-01 00:00:00+00') TO ('2026-11-01 00:00:00+00');

-- Partition 2d: November 2026 Monthly Partition
CREATE TABLE IF NOT EXISTS vehicle_location_history_y2026m11
PARTITION OF vehicle_location_history
FOR VALUES FROM ('2026-11-01 00:00:00+00') TO ('2026-12-01 00:00:00+00');

-- Partition Indexes (Engine automatically attaches to partitions)
CREATE INDEX IF NOT EXISTS idx_loc_hist_vehicle_time ON vehicle_location_history (vehicle_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_loc_hist_trip_time ON vehicle_location_history (trip_id, recorded_at DESC) WHERE trip_id IS NOT NULL;

-- 3. Telematics Diagnostic Events Log
CREATE TABLE IF NOT EXISTS tracking_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL,
    vehicle_id UUID NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    recorded_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tracking_events_dev FOREIGN KEY (device_id) REFERENCES tracking_devices(id) ON DELETE CASCADE,
    CONSTRAINT fk_tracking_events_veh FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tracking_events_vehicle_time ON tracking_events (vehicle_id, recorded_at DESC);

-- 4. Master Geofences Table (Depots, Terminals, Restricted Zones)
CREATE TABLE IF NOT EXISTS geofences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT NULL,
    latitude NUMERIC(10,7) NOT NULL,
    longitude NUMERIC(10,7) NOT NULL,
    radius_meters INTEGER NOT NULL,
    type VARCHAR(32) NOT NULL DEFAULT 'TERMINAL',
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_geofences_name UNIQUE (name),
    CONSTRAINT chk_geofences_lat CHECK (latitude BETWEEN -90.0 AND 90.0),
    CONSTRAINT chk_geofences_lon CHECK (longitude BETWEEN -180.0 AND 180.0),
    CONSTRAINT chk_geofences_radius CHECK (radius_meters > 0)
);

CREATE INDEX IF NOT EXISTS idx_geofences_coords ON geofences (latitude, longitude);

CREATE TRIGGER trg_geofences_updated_at
BEFORE UPDATE ON geofences
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- 5. Geofence Boundary Transition Events
CREATE TABLE IF NOT EXISTS geofence_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    geofence_id UUID NOT NULL,
    vehicle_id UUID NOT NULL,
    trip_id UUID NULL,
    event_type VARCHAR(32) NOT NULL,
    latitude NUMERIC(10,7) NOT NULL,
    longitude NUMERIC(10,7) NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_geofence_events_fence FOREIGN KEY (geofence_id) REFERENCES geofences(id) ON DELETE RESTRICT,
    CONSTRAINT fk_geofence_events_veh FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE RESTRICT,
    CONSTRAINT fk_geofence_events_trip FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE SET NULL,
    CONSTRAINT chk_geofence_events_type CHECK (event_type IN ('ENTER', 'EXIT'))
);

CREATE INDEX IF NOT EXISTS idx_geofence_events_vehicle ON geofence_events (vehicle_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_geofence_events_fence ON geofence_events(geofence_id);

-- Record migration
INSERT INTO schema_migrations (version, description, script, execution_time_ms, success)
VALUES ('V018', 'gps_tracking', 'V018__gps_tracking.sql', 0, TRUE)
ON CONFLICT (version) DO NOTHING;

COMMIT;
