-- =============================================================================
-- MOVANA PLATFORM DATABASE MIGRATION
-- Migration: V001__extensions.sql
-- Description: Enable core PostgreSQL extensions, schema migration tracking,
--              and base trigger functions.
-- Database Engine: PostgreSQL 16
-- =============================================================================

BEGIN;

-- Safety assertion: Prevent execution against unintended databases
DO $$
BEGIN
    IF current_database() <> 'movana' THEN
        RAISE EXCEPTION 'CRITICAL: Migration must run strictly inside "movana" database. Current: %', current_database();
    END IF;
END $$;

-- 1. Enable Core PostgreSQL Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gist";
CREATE EXTENSION IF NOT EXISTS "citext";

-- 2. Schema Migration Tracking Ledger
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(50) PRIMARY KEY,
    description VARCHAR(255) NOT NULL,
    type VARCHAR(20) NOT NULL DEFAULT 'SQL',
    script VARCHAR(255) NOT NULL,
    checksum VARCHAR(64) NULL,
    installed_by VARCHAR(100) NOT NULL DEFAULT current_user,
    installed_on TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    execution_time_ms INTEGER NOT NULL DEFAULT 0,
    success BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT chk_schema_migrations_time CHECK (execution_time_ms >= 0)
);

CREATE INDEX IF NOT EXISTS idx_schema_migrations_success ON schema_migrations(success);

COMMENT ON TABLE schema_migrations IS 'Authoritative ledger of applied schema migrations for version control.';

-- 3. Global Trigger Function: fn_set_updated_at()
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_set_updated_at() IS 'Standard trigger function to automatically update updated_at timestamps on record modification.';

-- Record this migration
INSERT INTO schema_migrations (version, description, script, execution_time_ms, success)
VALUES ('V001', 'extensions', 'V001__extensions.sql', 0, TRUE)
ON CONFLICT (version) DO NOTHING;

COMMIT;
