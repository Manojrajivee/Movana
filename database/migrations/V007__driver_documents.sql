-- =============================================================================
-- MOVANA PLATFORM DATABASE MIGRATION
-- Migration: V007__driver_documents.sql
-- Description: Driver document types catalog, uploaded compliance files,
--              and background verification evaluations.
-- Database Engine: PostgreSQL 16
-- =============================================================================

BEGIN;

DO $$
BEGIN
    IF current_database() <> 'movana' THEN
        RAISE EXCEPTION 'CRITICAL: Migration must run strictly inside "movana" database. Current: %', current_database();
    END IF;
END $$;

-- 1. Driver Document Types Master Catalog
CREATE TABLE IF NOT EXISTS driver_document_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT NULL,
    is_mandatory BOOLEAN NOT NULL DEFAULT TRUE,
    expires BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_driver_doc_types_code UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS idx_driver_doc_types_code ON driver_document_types(code);

-- 2. Driver Uploaded Compliance Documents
CREATE TABLE IF NOT EXISTS driver_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL,
    document_type_id UUID NOT NULL,
    document_number VARCHAR(100) NOT NULL,
    document_url TEXT NOT NULL,
    issued_date DATE NULL,
    expiry_date DATE NULL,
    verification_status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    verified_by UUID NULL,
    verified_at TIMESTAMPTZ NULL,
    rejection_reason TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_driver_docs_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE RESTRICT,
    CONSTRAINT fk_driver_docs_type FOREIGN KEY (document_type_id) REFERENCES driver_document_types(id) ON DELETE RESTRICT,
    CONSTRAINT fk_driver_docs_verifier FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT uq_driver_docs_type UNIQUE (driver_id, document_type_id),
    CONSTRAINT chk_driver_docs_dates CHECK (expiry_date IS NULL OR issued_date IS NULL OR expiry_date >= issued_date),
    CONSTRAINT chk_driver_docs_status CHECK (verification_status IN ('PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED'))
);

CREATE INDEX IF NOT EXISTS idx_driver_docs_driver ON driver_documents(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_docs_expiry ON driver_documents(expiry_date);

CREATE TRIGGER trg_driver_docs_updated_at
BEFORE UPDATE ON driver_documents
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- 3. Driver Background & Regulatory Verifications
CREATE TABLE IF NOT EXISTS driver_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL,
    verification_type VARCHAR(50) NOT NULL,
    status VARCHAR(32) NOT NULL,
    notes TEXT NULL,
    verified_by UUID NOT NULL,
    verified_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_driver_verif_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE RESTRICT,
    CONSTRAINT fk_driver_verif_user FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_driver_verif_driver ON driver_verifications(driver_id);

-- Record migration
INSERT INTO schema_migrations (version, description, script, execution_time_ms, success)
VALUES ('V007', 'driver_documents', 'V007__driver_documents.sql', 0, TRUE)
ON CONFLICT (version) DO NOTHING;

COMMIT;
