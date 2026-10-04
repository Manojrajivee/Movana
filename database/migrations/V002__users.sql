-- =============================================================================
-- MOVANA PLATFORM DATABASE MIGRATION
-- Migration: V002__users.sql
-- Description: Core identity, user authentication, session security, tokens,
--              and login attempt auditing.
-- Database Engine: PostgreSQL 16
-- =============================================================================

BEGIN;

DO $$
BEGIN
    IF current_database() <> 'movana' THEN
        RAISE EXCEPTION 'CRITICAL: Migration must run strictly inside "movana" database. Current: %', current_database();
    END IF;
END $$;

-- 1. Master Users Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(32) NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    date_of_birth DATE NULL,
    gender VARCHAR(20) NULL,
    profile_image_url TEXT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
    last_login_at TIMESTAMPTZ NULL,
    last_login_ip INET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ NULL,
    CONSTRAINT chk_users_status CHECK (status IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_active ON users (LOWER(email)) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_phone_active ON users (phone) WHERE deleted_at IS NULL AND phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

COMMENT ON TABLE users IS 'Authoritative user identities for passengers, operators, drivers, and administrators.';

-- 2. User Authentication Sessions
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    refresh_token_hash VARCHAR(255) NOT NULL,
    user_agent TEXT NULL,
    ip_address INET NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_user_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT uq_user_sessions_token_hash UNIQUE (refresh_token_hash),
    CONSTRAINT chk_user_sessions_expiry CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON user_sessions(expires_at) WHERE is_revoked IS FALSE;

-- 3. Login Attempts Security Log
CREATE TABLE IF NOT EXISTS login_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NULL,
    email VARCHAR(255) NOT NULL,
    ip_address INET NOT NULL,
    user_agent TEXT NULL,
    status VARCHAR(32) NOT NULL,
    failure_reason VARCHAR(255) NULL,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_login_attempts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_login_attempts_status CHECK (status IN ('SUCCESS', 'INVALID_CREDENTIALS', 'LOCKED_OUT', 'SUSPENDED', 'MFA_REQUIRED'))
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_email_time ON login_attempts (email, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time ON login_attempts (ip_address, attempted_at DESC);

-- 4. Security Events Log
CREATE TABLE IF NOT EXISTS security_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    ip_address INET NOT NULL,
    user_agent TEXT NULL,
    event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_security_events_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_security_events_user_time ON security_events (user_id, created_at DESC);

-- 5. Password Reset Tokens
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_password_reset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT uq_password_reset_token_hash UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens(user_id);

-- 6. Email Verification Tokens
CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    verified_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_email_verify_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT uq_email_verify_token_hash UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS idx_email_verify_user ON email_verification_tokens(user_id);

-- Record migration
INSERT INTO schema_migrations (version, description, script, execution_time_ms, success)
VALUES ('V002', 'users', 'V002__users.sql', 0, TRUE)
ON CONFLICT (version) DO NOTHING;

COMMIT;
