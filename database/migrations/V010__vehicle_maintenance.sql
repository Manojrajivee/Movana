-- =============================================================================
-- MOVANA PLATFORM DATABASE MIGRATION
-- Migration: V010__vehicle_maintenance.sql
-- Description: Vehicle maintenance schedules, work orders, service parts,
--              daily safety inspections, and mechanical defect tracking.
-- Database Engine: PostgreSQL 16
-- =============================================================================

BEGIN;

DO $$
BEGIN
    IF current_database() <> 'movana' THEN
        RAISE EXCEPTION 'CRITICAL: Migration must run strictly inside "movana" database. Current: %', current_database();
    END IF;
END $$;

-- 1. Preventative Maintenance Schedules
CREATE TABLE IF NOT EXISTS maintenance_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_type_id UUID NULL,
    vehicle_id UUID NULL,
    service_name VARCHAR(100) NOT NULL,
    interval_km INTEGER NOT NULL DEFAULT 10000,
    interval_days INTEGER NOT NULL DEFAULT 90,
    description TEXT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_maint_sched_vtype FOREIGN KEY (vehicle_type_id) REFERENCES vehicle_types(id) ON DELETE SET NULL,
    CONSTRAINT fk_maint_sched_veh FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
    CONSTRAINT chk_maint_sched_intervals CHECK (interval_km > 0 AND interval_days > 0)
);

CREATE INDEX IF NOT EXISTS idx_maint_sched_veh ON maintenance_schedules(vehicle_id);

CREATE TRIGGER trg_maint_sched_updated_at
BEFORE UPDATE ON maintenance_schedules
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- 2. Maintenance Work Orders & Service Execution
CREATE TABLE IF NOT EXISTS maintenance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID NOT NULL,
    maintenance_type VARCHAR(32) NOT NULL DEFAULT 'SCHEDULED',
    scheduled_date DATE NOT NULL,
    completed_date DATE NULL,
    odometer NUMERIC(10,2) NOT NULL,
    cost NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    vendor VARCHAR(150) NOT NULL,
    description TEXT NOT NULL,
    technician VARCHAR(100) NOT NULL,
    next_due_date DATE NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'SCHEDULED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_maint_records_veh FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE RESTRICT,
    CONSTRAINT chk_maint_records_status CHECK (status IN ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
    CONSTRAINT chk_maint_records_cost CHECK (cost >= 0.00)
);

CREATE INDEX IF NOT EXISTS idx_maint_records_veh ON maintenance_records(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_maint_records_status ON maintenance_records(status);

CREATE TRIGGER trg_maint_records_updated_at
BEFORE UPDATE ON maintenance_records
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- 3. Maintenance Service Items
CREATE TABLE IF NOT EXISTS maintenance_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    maintenance_record_id UUID NOT NULL,
    item_name VARCHAR(150) NOT NULL,
    description TEXT NULL,
    item_cost NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    status VARCHAR(32) NOT NULL DEFAULT 'COMPLETED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_maint_items_record FOREIGN KEY (maintenance_record_id) REFERENCES maintenance_records(id) ON DELETE CASCADE,
    CONSTRAINT chk_maint_items_cost CHECK (item_cost >= 0.00)
);

CREATE INDEX IF NOT EXISTS idx_maint_items_record ON maintenance_items(maintenance_record_id);

-- 4. Maintenance Spare Parts & Consumables
CREATE TABLE IF NOT EXISTS maintenance_parts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    maintenance_item_id UUID NOT NULL,
    part_number VARCHAR(100) NOT NULL,
    part_name VARCHAR(150) NOT NULL,
    quantity NUMERIC(6,2) NOT NULL DEFAULT 1.00,
    unit_cost NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    total_cost NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    supplier VARCHAR(150) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_maint_parts_item FOREIGN KEY (maintenance_item_id) REFERENCES maintenance_items(id) ON DELETE CASCADE,
    CONSTRAINT chk_maint_parts_total CHECK (total_cost = (quantity * unit_cost))
);

CREATE INDEX IF NOT EXISTS idx_maint_parts_item ON maintenance_parts(maintenance_item_id);

-- 5. Daily Vehicle Inspections
CREATE TABLE IF NOT EXISTS vehicle_inspections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID NOT NULL,
    inspection_type VARCHAR(32) NOT NULL DEFAULT 'PRE_TRIP',
    inspector_id UUID NOT NULL,
    trip_id UUID NULL,
    inspection_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(32) NOT NULL DEFAULT 'PASSED',
    odometer NUMERIC(10,2) NOT NULL,
    notes TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_vehicle_insp_veh FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE RESTRICT,
    CONSTRAINT fk_vehicle_insp_user FOREIGN KEY (inspector_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT chk_vehicle_insp_type CHECK (inspection_type IN ('PRE_TRIP', 'POST_TRIP', 'PERIODIC', 'SAFETY_AUDIT')),
    CONSTRAINT chk_vehicle_insp_status CHECK (status IN ('PASSED', 'FAILED', 'NEEDS_REPAIR'))
);

CREATE INDEX IF NOT EXISTS idx_vehicle_insp_veh_time ON vehicle_inspections (vehicle_id, inspection_date DESC);

CREATE TRIGGER trg_vehicle_insp_updated_at
BEFORE UPDATE ON vehicle_inspections
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- 6. Inspection Checklist Items
CREATE TABLE IF NOT EXISTS vehicle_inspection_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inspection_id UUID NOT NULL,
    checklist_item VARCHAR(150) NOT NULL,
    category VARCHAR(50) NOT NULL DEFAULT 'SAFETY',
    result_status VARCHAR(32) NOT NULL DEFAULT 'PASS',
    notes TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_veh_insp_items_insp FOREIGN KEY (inspection_id) REFERENCES vehicle_inspections(id) ON DELETE CASCADE,
    CONSTRAINT chk_veh_insp_items_status CHECK (result_status IN ('PASS', 'FAIL', 'WARNING', 'NA'))
);

CREATE INDEX IF NOT EXISTS idx_veh_insp_items_insp ON vehicle_inspection_items(inspection_id);

-- 7. Inspection Defect Issues
CREATE TABLE IF NOT EXISTS vehicle_inspection_issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inspection_item_id UUID NOT NULL,
    issue_description TEXT NOT NULL,
    severity VARCHAR(32) NOT NULL DEFAULT 'MAJOR',
    is_blocking BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_veh_insp_issues_item FOREIGN KEY (inspection_item_id) REFERENCES vehicle_inspection_items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_veh_insp_issues_item ON vehicle_inspection_issues(inspection_item_id);

-- Record migration
INSERT INTO schema_migrations (version, description, script, execution_time_ms, success)
VALUES ('V010', 'vehicle_maintenance', 'V010__vehicle_maintenance.sql', 0, TRUE)
ON CONFLICT (version) DO NOTHING;

COMMIT;
