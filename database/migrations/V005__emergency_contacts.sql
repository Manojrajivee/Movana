-- =============================================================================
-- MOVANA PLATFORM DATABASE MIGRATION
-- Migration: V005__emergency_contacts.sql
-- Description: Emergency contact directory and user saved transit addresses.
-- Database Engine: PostgreSQL 16
-- =============================================================================

BEGIN;

DO $$
BEGIN
    IF current_database() <> 'movana' THEN
        RAISE EXCEPTION 'CRITICAL: Migration must run strictly inside "movana" database. Current: %', current_database();
    END IF;
END $$;

-- 1. Emergency Contacts Table
CREATE TABLE IF NOT EXISTS emergency_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    name VARCHAR(100) NOT NULL,
    relationship VARCHAR(50) NOT NULL,
    phone VARCHAR(32) NOT NULL,
    email VARCHAR(255) NULL,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_emergency_contacts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_emergency_contacts_user ON emergency_contacts(user_id);

CREATE TRIGGER trg_emergency_contacts_updated_at
BEFORE UPDATE ON emergency_contacts
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- 2. User Saved Addresses Table
CREATE TABLE IF NOT EXISTS user_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    address_type VARCHAR(32) NOT NULL DEFAULT 'HOME',
    street_address TEXT NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    postal_code VARCHAR(20) NOT NULL,
    country VARCHAR(100) NOT NULL DEFAULT 'India',
    latitude NUMERIC(10,7) NULL,
    longitude NUMERIC(10,7) NULL,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_user_addresses_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT chk_user_addresses_lat CHECK (latitude IS NULL OR (latitude BETWEEN -90.0 AND 90.0)),
    CONSTRAINT chk_user_addresses_lon CHECK (longitude IS NULL OR (longitude BETWEEN -180.0 AND 180.0))
);

CREATE INDEX IF NOT EXISTS idx_user_addresses_user ON user_addresses(user_id);

CREATE TRIGGER trg_user_addresses_updated_at
BEFORE UPDATE ON user_addresses
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- Record migration
INSERT INTO schema_migrations (version, description, script, execution_time_ms, success)
VALUES ('V005', 'emergency_contacts', 'V005__emergency_contacts.sql', 0, TRUE)
ON CONFLICT (version) DO NOTHING;

COMMIT;
