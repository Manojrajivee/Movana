-- =============================================================================
-- MOVANA PLATFORM DATABASE MIGRATION
-- Migration: V008__vehicles.sql
-- Description: Fleet manufacturers, vehicle models, classification types,
--              physical bus registry, status history, and fleet assignments.
-- Database Engine: PostgreSQL 16
-- =============================================================================

BEGIN;

DO $$
BEGIN
    IF current_database() <> 'movana' THEN
        RAISE EXCEPTION 'CRITICAL: Migration must run strictly inside "movana" database. Current: %', current_database();
    END IF;
END $$;

-- 1. Vehicle Manufacturers Table
CREATE TABLE IF NOT EXISTS vehicle_manufacturers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    country VARCHAR(100) NOT NULL,
    website VARCHAR(255) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_vehicle_manufacturers_name UNIQUE (name)
);

-- 2. Vehicle Models Table
CREATE TABLE IF NOT EXISTS vehicle_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    manufacturer_id UUID NOT NULL,
    name VARCHAR(100) NOT NULL,
    release_year SMALLINT NULL,
    default_capacity INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_vehicle_models_mfg FOREIGN KEY (manufacturer_id) REFERENCES vehicle_manufacturers(id) ON DELETE RESTRICT,
    CONSTRAINT uq_vehicle_models_mfg_name UNIQUE (manufacturer_id, name),
    CONSTRAINT chk_vehicle_models_cap CHECK (default_capacity > 0)
);

CREATE INDEX IF NOT EXISTS idx_vehicle_models_mfg ON vehicle_models(manufacturer_id);

-- 3. Vehicle Classification Types (Service Classes)
CREATE TABLE IF NOT EXISTS vehicle_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT NULL,
    default_fare_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.00,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_vehicle_types_code UNIQUE (code),
    CONSTRAINT chk_vehicle_types_mult CHECK (default_fare_multiplier >= 0.50)
);

CREATE INDEX IF NOT EXISTS idx_vehicle_types_code ON vehicle_types(code);

-- 4. Master Physical Vehicles Registry
CREATE TABLE IF NOT EXISTS vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_number VARCHAR(32) NOT NULL,
    vehicle_code VARCHAR(32) NOT NULL,
    vehicle_type_id UUID NOT NULL,
    manufacturer_id UUID NOT NULL,
    model_id UUID NOT NULL,
    model_year SMALLINT NOT NULL,
    vin VARCHAR(64) NOT NULL,
    engine_number VARCHAR(64) NOT NULL,
    capacity INTEGER NOT NULL,
    standing_capacity INTEGER NOT NULL DEFAULT 0,
    seat_capacity INTEGER NOT NULL,
    fuel_type VARCHAR(32) NOT NULL DEFAULT 'DIESEL',
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    current_odometer NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    current_latitude NUMERIC(10,7) NULL,
    current_longitude NUMERIC(10,7) NULL,
    last_location_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ NULL,
    CONSTRAINT fk_vehicles_type FOREIGN KEY (vehicle_type_id) REFERENCES vehicle_types(id) ON DELETE RESTRICT,
    CONSTRAINT fk_vehicles_mfg FOREIGN KEY (manufacturer_id) REFERENCES vehicle_manufacturers(id) ON DELETE RESTRICT,
    CONSTRAINT fk_vehicles_model FOREIGN KEY (model_id) REFERENCES vehicle_models(id) ON DELETE RESTRICT,
    CONSTRAINT uq_vehicles_reg_num UNIQUE (registration_number),
    CONSTRAINT uq_vehicles_code UNIQUE (vehicle_code),
    CONSTRAINT uq_vehicles_vin UNIQUE (vin),
    CONSTRAINT chk_vehicles_cap CHECK (capacity = seat_capacity + standing_capacity),
    CONSTRAINT chk_vehicles_fuel CHECK (fuel_type IN ('DIESEL', 'ELECTRIC', 'CNG', 'HYBRID')),
    CONSTRAINT chk_vehicles_status CHECK (status IN ('ACTIVE', 'MAINTENANCE', 'DECOMMISSIONED', 'RESERVED')),
    CONSTRAINT chk_vehicles_lat CHECK (current_latitude IS NULL OR (current_latitude BETWEEN -90.0 AND 90.0)),
    CONSTRAINT chk_vehicles_lon CHECK (current_longitude IS NULL OR (current_longitude BETWEEN -180.0 AND 180.0))
);

CREATE INDEX IF NOT EXISTS idx_vehicles_reg_num ON vehicles(registration_number);
CREATE INDEX IF NOT EXISTS idx_vehicles_status ON vehicles(status);
CREATE INDEX IF NOT EXISTS idx_vehicles_loc ON vehicles (current_latitude, current_longitude) WHERE status = 'ACTIVE';

CREATE TRIGGER trg_vehicles_updated_at
BEFORE UPDATE ON vehicles
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- 5. Vehicle Status History Audit Log
CREATE TABLE IF NOT EXISTS vehicle_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID NOT NULL,
    old_status VARCHAR(32) NOT NULL,
    new_status VARCHAR(32) NOT NULL,
    reason TEXT NULL,
    changed_by UUID NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_vehicle_status_hist_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE RESTRICT,
    CONSTRAINT fk_vehicle_status_hist_user FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_vehicle_status_hist_vehicle ON vehicle_status_history (vehicle_id, created_at DESC);

-- 6. Vehicle Assignments (Operational Fleet Dispatch)
CREATE TABLE IF NOT EXISTS vehicle_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID NOT NULL,
    driver_id UUID NOT NULL,
    trip_id UUID NULL,
    assignment_type VARCHAR(32) NOT NULL DEFAULT 'TRIP',
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    assigned_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_vehicle_assign_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE RESTRICT,
    CONSTRAINT fk_vehicle_assign_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE RESTRICT,
    CONSTRAINT fk_vehicle_assign_user FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT chk_vehicle_assign_status CHECK (status IN ('SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED'))
);

CREATE INDEX IF NOT EXISTS idx_vehicle_assign_vehicle ON vehicle_assignments(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_assign_driver ON vehicle_assignments(driver_id);

CREATE TRIGGER trg_vehicle_assign_updated_at
BEFORE UPDATE ON vehicle_assignments
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- Resolve deferred FK from driver_assignments to vehicles
ALTER TABLE driver_assignments
ADD CONSTRAINT fk_driver_assign_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL;

-- Record migration
INSERT INTO schema_migrations (version, description, script, execution_time_ms, success)
VALUES ('V008', 'vehicles', 'V008__vehicles.sql', 0, TRUE)
ON CONFLICT (version) DO NOTHING;

COMMIT;
