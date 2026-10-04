-- =============================================================================
-- MOVANA PLATFORM DATABASE MIGRATION
-- Migration: V023__settings_attachments.sql
-- Description: Object storage file attachments metadata, runtime system settings,
--              and feature flag gradual rollout toggles.
-- Database Engine: PostgreSQL 16
-- =============================================================================

BEGIN;

DO $$
BEGIN
    IF current_database() <> 'movana' THEN
        RAISE EXCEPTION 'CRITICAL: Migration must run strictly inside "movana" database. Current: %', current_database();
    END IF;
END $$;

-- 1. Master File Attachments Metadata (Cloud Object Storage Pointer)
CREATE TABLE IF NOT EXISTS file_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(64) NOT NULL,
    entity_id UUID NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    storage_key VARCHAR(512) NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    file_size BIGINT NOT NULL,
    checksum VARCHAR(64) NOT NULL,
    uploaded_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ NULL,
    CONSTRAINT fk_file_attachments_uploader FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT uq_file_attachments_key UNIQUE (storage_key),
    CONSTRAINT chk_file_attachments_size CHECK (file_size > 0)
);

CREATE INDEX IF NOT EXISTS idx_file_attachments_entity ON file_attachments (entity_type, entity_id) WHERE deleted_at IS NULL;

-- Resolve deferred FK from support_ticket_attachments to file_attachments
ALTER TABLE support_ticket_attachments
ADD CONSTRAINT fk_support_attach_file FOREIGN KEY (file_attachment_id) REFERENCES file_attachments(id) ON DELETE RESTRICT;

-- 2. System Operational Settings Table
CREATE TABLE IF NOT EXISTS system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    setting_key VARCHAR(100) NOT NULL,
    setting_value JSONB NOT NULL,
    value_type VARCHAR(32) NOT NULL DEFAULT 'STRING',
    description TEXT NULL,
    is_public BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_system_settings_key UNIQUE (setting_key)
);

CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(setting_key);

CREATE TRIGGER trg_system_settings_updated_at
BEFORE UPDATE ON system_settings
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_system_settings_audit
AFTER UPDATE OR DELETE ON system_settings
FOR EACH ROW EXECUTE FUNCTION fn_record_audit_log();

-- 3. Feature Flags Toggles Table
CREATE TABLE IF NOT EXISTS feature_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flag_key VARCHAR(100) NOT NULL,
    name VARCHAR(150) NOT NULL,
    description TEXT NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    target_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_feature_flags_key UNIQUE (flag_key)
);

CREATE INDEX IF NOT EXISTS idx_feature_flags_key ON feature_flags(flag_key);

CREATE TRIGGER trg_feature_flags_updated_at
BEFORE UPDATE ON feature_flags
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- Record migration
INSERT INTO schema_migrations (version, description, script, execution_time_ms, success)
VALUES ('V023', 'settings_attachments', 'V023__settings_attachments.sql', 0, TRUE)
ON CONFLICT (version) DO NOTHING;

COMMIT;
