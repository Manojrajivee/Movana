-- =============================================================================
-- MOVANA PLATFORM DATABASE MIGRATION
-- Migration: V019__safety_incidents.sql
-- Description: Safety incident classification, incident investigations,
--              corrective actions, passenger/driver SOS triggers, and driving infractions.
-- Database Engine: PostgreSQL 16
-- =============================================================================

BEGIN;

DO $$
BEGIN
    IF current_database() <> 'movana' THEN
        RAISE EXCEPTION 'CRITICAL: Migration must run strictly inside "movana" database. Current: %', current_database();
    END IF;
END $$;

-- 1. Incident Classification Types Catalog
CREATE TABLE IF NOT EXISTS incident_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL,
    description TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_incident_types_code UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS idx_incident_types_code ON incident_types(code);

-- 2. Incident Severity Levels Scale
CREATE TABLE IF NOT EXISTS incident_severity_levels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(32) NOT NULL,
    name VARCHAR(50) NOT NULL,
    level_rank INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_incident_sev_code UNIQUE (code),
    CONSTRAINT uq_incident_sev_rank UNIQUE (level_rank)
);

-- 3. Master Incidents Log
CREATE TABLE IF NOT EXISTS incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_number VARCHAR(64) NOT NULL,
    trip_id UUID NULL,
    vehicle_id UUID NULL,
    driver_id UUID NULL,
    reported_by UUID NOT NULL,
    incident_type_id UUID NOT NULL,
    severity VARCHAR(32) NOT NULL DEFAULT 'MEDIUM',
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    latitude NUMERIC(10,7) NULL,
    longitude NUMERIC(10,7) NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    reported_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(32) NOT NULL DEFAULT 'OPEN',
    resolved_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_incidents_trip FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE SET NULL,
    CONSTRAINT fk_incidents_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL,
    CONSTRAINT fk_incidents_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL,
    CONSTRAINT fk_incidents_reporter FOREIGN KEY (reported_by) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_incidents_type FOREIGN KEY (incident_type_id) REFERENCES incident_types(id) ON DELETE RESTRICT,
    CONSTRAINT uq_incidents_num UNIQUE (incident_number),
    CONSTRAINT chk_incidents_severity CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    CONSTRAINT chk_incidents_status CHECK (status IN ('OPEN', 'INVESTIGATING', 'ACTION_REQUIRED', 'RESOLVED', 'CLOSED'))
);

CREATE INDEX IF NOT EXISTS idx_incidents_num ON incidents(incident_number);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_trip ON incidents(trip_id);
CREATE INDEX IF NOT EXISTS idx_incidents_vehicle ON incidents(vehicle_id);

CREATE TRIGGER trg_incidents_updated_at
BEFORE UPDATE ON incidents
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- 4. Incident Detailed Findings & Witness Statements
CREATE TABLE IF NOT EXISTS incident_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID NOT NULL,
    submitted_by UUID NOT NULL,
    report_details TEXT NOT NULL,
    witnesses JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_incident_reports_incident FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE,
    CONSTRAINT fk_incident_reports_user FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_incident_reports_incident ON incident_reports(incident_id);

-- 5. Incident Corrective & Preventative Actions
CREATE TABLE IF NOT EXISTS incident_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID NOT NULL,
    action_taken TEXT NOT NULL,
    taken_by UUID NOT NULL,
    action_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(32) NOT NULL DEFAULT 'COMPLETED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_incident_actions_incident FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE,
    CONSTRAINT fk_incident_actions_user FOREIGN KEY (taken_by) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_incident_actions_incident ON incident_actions(incident_id);

-- 6. Emergency Panic Button & SOS Events Table
CREATE TABLE IF NOT EXISTS emergency_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL,
    vehicle_id UUID NOT NULL,
    driver_id UUID NULL,
    user_id UUID NOT NULL,
    emergency_type VARCHAR(50) NOT NULL DEFAULT 'SOS_BUTTON',
    latitude NUMERIC(10,7) NOT NULL,
    longitude NUMERIC(10,7) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'TRIGGERED',
    triggered_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_emergency_events_trip FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE RESTRICT,
    CONSTRAINT fk_emergency_events_veh FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE RESTRICT,
    CONSTRAINT fk_emergency_events_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT chk_emergency_events_status CHECK (status IN ('TRIGGERED', 'DISPATCHED', 'FALSE_ALARM', 'RESOLVED'))
);

CREATE INDEX IF NOT EXISTS idx_emergency_active ON emergency_events(status) WHERE status = 'TRIGGERED';
CREATE INDEX IF NOT EXISTS idx_emergency_events_trip ON emergency_events(trip_id);

-- 7. Telematics Driving Behavior Infractions Log
CREATE TABLE IF NOT EXISTS driver_safety_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL,
    vehicle_id UUID NOT NULL,
    trip_id UUID NULL,
    event_type VARCHAR(64) NOT NULL,
    severity VARCHAR(32) NOT NULL DEFAULT 'MEDIUM',
    speed_kmh NUMERIC(6,2) NULL,
    latitude NUMERIC(10,7) NULL,
    longitude NUMERIC(10,7) NULL,
    event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    occurred_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_driver_safety_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE RESTRICT,
    CONSTRAINT fk_driver_safety_veh FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE RESTRICT,
    CONSTRAINT fk_driver_safety_trip FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE SET NULL,
    CONSTRAINT chk_driver_safety_type CHECK (event_type IN ('HARSH_BRAKING', 'OVERSPEED', 'RAPID_ACCEL', 'GEOFENCE_VIOLATION', 'DROWSINESS', 'HOURS_EXCEEDED'))
);

CREATE INDEX IF NOT EXISTS idx_driver_safety_driver_time ON driver_safety_events (driver_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_safety_veh ON driver_safety_events(vehicle_id);

-- Record migration
INSERT INTO schema_migrations (version, description, script, execution_time_ms, success)
VALUES ('V019', 'safety_incidents', 'V019__safety_incidents.sql', 0, TRUE)
ON CONFLICT (version) DO NOTHING;

COMMIT;
