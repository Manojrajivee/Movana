-- =============================================================================
-- MOVANA PLATFORM DATABASE MIGRATION
-- Migration: V006__drivers.sql
-- Description: Driver profiles, commercial licensing, availability shifts,
--              status transition history, and duty assignment rosters.
-- Database Engine: PostgreSQL 16
-- =============================================================================

BEGIN;

DO $$
BEGIN
    IF current_database() <> 'movana' THEN
        RAISE EXCEPTION 'CRITICAL: Migration must run strictly inside "movana" database. Current: %', current_database();
    END IF;
END $$;

-- 1. Master Drivers Table
CREATE TABLE IF NOT EXISTS drivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    employee_code VARCHAR(50) NOT NULL,
    license_number VARCHAR(50) NOT NULL,
    license_category VARCHAR(50) NOT NULL,
    license_expiry_date DATE NOT NULL,
    date_of_joining DATE NOT NULL DEFAULT CURRENT_DATE,
    employment_status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    verification_status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    rating_average NUMERIC(3,2) NOT NULL DEFAULT 5.00,
    total_trips INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ NULL,
    CONSTRAINT fk_drivers_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT uq_drivers_user UNIQUE (user_id),
    CONSTRAINT uq_drivers_emp_code UNIQUE (employee_code),
    CONSTRAINT uq_drivers_license UNIQUE (license_number),
    CONSTRAINT chk_drivers_rating CHECK (rating_average BETWEEN 1.00 AND 5.00),
    CONSTRAINT chk_drivers_emp_status CHECK (employment_status IN ('ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'TERMINATED')),
    CONSTRAINT chk_drivers_verif_status CHECK (verification_status IN ('PENDING', 'VERIFIED', 'REJECTED'))
);

CREATE INDEX IF NOT EXISTS idx_drivers_emp_code ON drivers(employee_code);
CREATE INDEX IF NOT EXISTS idx_drivers_license ON drivers(license_number);
CREATE INDEX IF NOT EXISTS idx_drivers_status ON drivers(employment_status);

CREATE TRIGGER trg_drivers_updated_at
BEFORE UPDATE ON drivers
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- 2. Driver Availability Shifts Table
CREATE TABLE IF NOT EXISTS driver_availability (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL,
    day_of_week SMALLINT NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_driver_avail_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE,
    CONSTRAINT chk_driver_avail_day CHECK (day_of_week BETWEEN 0 AND 6),
    CONSTRAINT chk_driver_avail_time CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_driver_avail_driver ON driver_availability (driver_id, day_of_week);

CREATE TRIGGER trg_driver_avail_updated_at
BEFORE UPDATE ON driver_availability
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- 3. Driver Status History Log
CREATE TABLE IF NOT EXISTS driver_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL,
    old_status VARCHAR(32) NOT NULL,
    new_status VARCHAR(32) NOT NULL,
    reason TEXT NULL,
    changed_by UUID NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_driver_status_hist_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE RESTRICT,
    CONSTRAINT fk_driver_status_hist_user FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_driver_status_hist_driver ON driver_status_history (driver_id, created_at DESC);

-- 4. Driver Emergency Contacts
CREATE TABLE IF NOT EXISTS driver_emergency_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL,
    name VARCHAR(100) NOT NULL,
    relationship VARCHAR(50) NOT NULL,
    phone VARCHAR(32) NOT NULL,
    email VARCHAR(255) NULL,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_driver_emerg_contacts_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_driver_emerg_contacts_driver ON driver_emergency_contacts(driver_id);

CREATE TRIGGER trg_driver_emerg_contacts_updated_at
BEFORE UPDATE ON driver_emergency_contacts
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- 5. Driver Duty & Shift Assignments
CREATE TABLE IF NOT EXISTS driver_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL,
    vehicle_id UUID NULL,
    trip_id UUID NULL,
    assignment_type VARCHAR(32) NOT NULL DEFAULT 'REGULAR_SHIFT',
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'SCHEDULED',
    assigned_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_driver_assign_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE RESTRICT,
    CONSTRAINT fk_driver_assign_user FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT chk_driver_assign_status CHECK (status IN ('SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED'))
);

CREATE INDEX IF NOT EXISTS idx_driver_assign_driver ON driver_assignments(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_assign_dates ON driver_assignments (start_at, end_at);

CREATE TRIGGER trg_driver_assign_updated_at
BEFORE UPDATE ON driver_assignments
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- Record migration
INSERT INTO schema_migrations (version, description, script, execution_time_ms, success)
VALUES ('V006', 'drivers', 'V006__drivers.sql', 0, TRUE)
ON CONFLICT (version) DO NOTHING;

COMMIT;
