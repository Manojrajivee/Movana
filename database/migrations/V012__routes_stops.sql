-- =============================================================================
-- MOVANA PLATFORM DATABASE MIGRATION
-- Migration: V012__routes_stops.sql
-- Description: Transit stops, route definitions, stop topological sequence,
--              and historical route revisioning.
-- Database Engine: PostgreSQL 16
-- =============================================================================

BEGIN;

DO $$
BEGIN
    IF current_database() <> 'movana' THEN
        RAISE EXCEPTION 'CRITICAL: Migration must run strictly inside "movana" database. Current: %', current_database();
    END IF;
END $$;

-- 1. Master Transit Stops & Stations Table
CREATE TABLE IF NOT EXISTS stops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stop_code VARCHAR(32) NOT NULL,
    name VARCHAR(150) NOT NULL,
    description TEXT NULL,
    address TEXT NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    country VARCHAR(100) NOT NULL DEFAULT 'India',
    postal_code VARCHAR(20) NULL,
    latitude NUMERIC(10,7) NOT NULL,
    longitude NUMERIC(10,7) NOT NULL,
    geofence_radius_meters INTEGER NOT NULL DEFAULT 100,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_stops_code UNIQUE (stop_code),
    CONSTRAINT chk_stops_lat CHECK (latitude BETWEEN -90.0 AND 90.0),
    CONSTRAINT chk_stops_lon CHECK (longitude BETWEEN -180.0 AND 180.0),
    CONSTRAINT chk_stops_radius CHECK (geofence_radius_meters >= 10),
    CONSTRAINT chk_stops_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'TEMPORARILY_CLOSED'))
);

CREATE INDEX IF NOT EXISTS idx_stops_code ON stops(stop_code);
CREATE INDEX IF NOT EXISTS idx_stops_city ON stops(city);
CREATE INDEX IF NOT EXISTS idx_stops_coords ON stops (latitude, longitude);

CREATE TRIGGER trg_stops_updated_at
BEFORE UPDATE ON stops
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- 2. Master Transportation Routes Table
CREATE TABLE IF NOT EXISTS routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_code VARCHAR(50) NOT NULL,
    name VARCHAR(150) NOT NULL,
    description TEXT NULL,
    origin_stop_id UUID NOT NULL,
    destination_stop_id UUID NOT NULL,
    distance_km NUMERIC(8,2) NOT NULL,
    estimated_duration_minutes INTEGER NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ NULL,
    CONSTRAINT fk_routes_origin FOREIGN KEY (origin_stop_id) REFERENCES stops(id) ON DELETE RESTRICT,
    CONSTRAINT fk_routes_dest FOREIGN KEY (destination_stop_id) REFERENCES stops(id) ON DELETE RESTRICT,
    CONSTRAINT uq_routes_code UNIQUE (route_code),
    CONSTRAINT chk_routes_diff_stops CHECK (origin_stop_id <> destination_stop_id),
    CONSTRAINT chk_routes_dist CHECK (distance_km > 0.0),
    CONSTRAINT chk_routes_dur CHECK (estimated_duration_minutes > 0),
    CONSTRAINT chk_routes_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED'))
);

CREATE INDEX IF NOT EXISTS idx_routes_code ON routes(route_code);
CREATE INDEX IF NOT EXISTS idx_routes_origin_dest ON routes (origin_stop_id, destination_stop_id);

CREATE TRIGGER trg_routes_updated_at
BEFORE UPDATE ON routes
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- 3. Route Versions History Table
CREATE TABLE IF NOT EXISTS route_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id UUID NOT NULL,
    version_number INTEGER NOT NULL DEFAULT 1,
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to DATE NULL,
    is_current BOOLEAN NOT NULL DEFAULT TRUE,
    change_notes TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_route_versions_route FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE,
    CONSTRAINT uq_route_versions_route_num UNIQUE (route_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_route_versions_current ON route_versions (route_id, is_current);

-- 4. Route Stops Sequence & Travel Timing Offsets
CREATE TABLE IF NOT EXISTS route_stops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id UUID NOT NULL,
    stop_id UUID NOT NULL,
    sequence_number INTEGER NOT NULL,
    arrival_offset_minutes INTEGER NOT NULL DEFAULT 0,
    departure_offset_minutes INTEGER NOT NULL DEFAULT 0,
    distance_from_origin_km NUMERIC(8,2) NOT NULL DEFAULT 0.00,
    is_boarding_allowed BOOLEAN NOT NULL DEFAULT TRUE,
    is_dropoff_allowed BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_route_stops_route FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE,
    CONSTRAINT fk_route_stops_stop FOREIGN KEY (stop_id) REFERENCES stops(id) ON DELETE RESTRICT,
    CONSTRAINT uq_route_stops_route_seq UNIQUE (route_id, sequence_number),
    CONSTRAINT uq_route_stops_route_stop UNIQUE (route_id, stop_id),
    CONSTRAINT chk_route_stops_seq CHECK (sequence_number >= 1),
    CONSTRAINT chk_route_stops_offsets CHECK (departure_offset_minutes >= arrival_offset_minutes)
);

CREATE INDEX IF NOT EXISTS idx_route_stops_route_seq ON route_stops (route_id, sequence_number);
CREATE INDEX IF NOT EXISTS idx_route_stops_stop ON route_stops(stop_id);

CREATE TRIGGER trg_route_stops_updated_at
BEFORE UPDATE ON route_stops
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- Record migration
INSERT INTO schema_migrations (version, description, script, execution_time_ms, success)
VALUES ('V012', 'routes_stops', 'V012__routes_stops.sql', 0, TRUE)
ON CONFLICT (version) DO NOTHING;

COMMIT;
