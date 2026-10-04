-- =============================================================================
-- MOVANA PLATFORM DATABASE MIGRATION
-- Migration: V009__vehicle_documents.sql
-- Description: Regulatory vehicle documents (Registration certificates,
--              road fitness, permits, and commercial insurance policies).
-- Database Engine: PostgreSQL 16
-- =============================================================================

BEGIN;

DO $$
BEGIN
    IF current_database() <> 'movana' THEN
        RAISE EXCEPTION 'CRITICAL: Migration must run strictly inside "movana" database. Current: %', current_database();
    END IF;
END $$;

-- 1. Vehicle Compliance Documents Table
CREATE TABLE IF NOT EXISTS vehicle_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID NOT NULL,
    document_type VARCHAR(50) NOT NULL,
    document_number VARCHAR(100) NOT NULL,
    document_url TEXT NOT NULL,
    issued_date DATE NOT NULL,
    expiry_date DATE NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'VALID',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_vehicle_docs_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE RESTRICT,
    CONSTRAINT chk_vehicle_docs_dates CHECK (expiry_date >= issued_date),
    CONSTRAINT chk_vehicle_docs_status CHECK (status IN ('VALID', 'EXPIRED', 'PENDING_RENEWAL'))
);

CREATE INDEX IF NOT EXISTS idx_vehicle_docs_vehicle ON vehicle_documents(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_docs_expiry ON vehicle_documents(expiry_date);

CREATE TRIGGER trg_vehicle_docs_updated_at
BEFORE UPDATE ON vehicle_documents
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- Record migration
INSERT INTO schema_migrations (version, description, script, execution_time_ms, success)
VALUES ('V009', 'vehicle_documents', 'V009__vehicle_documents.sql', 0, TRUE)
ON CONFLICT (version) DO NOTHING;

COMMIT;
