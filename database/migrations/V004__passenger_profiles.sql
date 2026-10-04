-- =============================================================================
-- MOVANA PLATFORM DATABASE MIGRATION
-- Migration: V004__passenger_profiles.sql
-- Description: Passenger profiles, accessibility requirements, and user preferences.
-- Database Engine: PostgreSQL 16
-- =============================================================================

BEGIN;

DO $$
BEGIN
    IF current_database() <> 'movana' THEN
        RAISE EXCEPTION 'CRITICAL: Migration must run strictly inside "movana" database. Current: %', current_database();
    END IF;
END $$;

-- 1. Passenger Profiles Table
CREATE TABLE IF NOT EXISTS passenger_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    date_of_birth DATE NULL,
    gender VARCHAR(20) NULL,
    profile_photo_url TEXT NULL,
    preferred_language VARCHAR(10) NOT NULL DEFAULT 'en',
    preferred_currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    accessibility_requirements TEXT NULL,
    special_requirements TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_passenger_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT uq_passenger_profiles_user UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_passenger_profiles_user_id ON passenger_profiles(user_id);

CREATE TRIGGER trg_passenger_profiles_updated_at
BEFORE UPDATE ON passenger_profiles
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- 2. User Preferences Table
CREATE TABLE IF NOT EXISTS user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    sms_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    push_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    marketing_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    trip_updates_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_user_preferences_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT uq_user_preferences_user UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);

CREATE TRIGGER trg_user_preferences_updated_at
BEFORE UPDATE ON user_preferences
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- Record migration
INSERT INTO schema_migrations (version, description, script, execution_time_ms, success)
VALUES ('V004', 'passenger_profiles', 'V004__passenger_profiles.sql', 0, TRUE)
ON CONFLICT (version) DO NOTHING;

COMMIT;
