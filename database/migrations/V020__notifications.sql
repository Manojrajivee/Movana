-- =============================================================================
-- MOVANA PLATFORM DATABASE MIGRATION
-- Migration: V020__notifications.sql
-- Description: Multi-channel messaging templates, user notification preferences,
--              dispatch queue, and delivery provider transmission logs.
-- Database Engine: PostgreSQL 16
-- =============================================================================

BEGIN;

DO $$
BEGIN
    IF current_database() <> 'movana' THEN
        RAISE EXCEPTION 'CRITICAL: Migration must run strictly inside "movana" database. Current: %', current_database();
    END IF;
END $$;

-- 1. Multi-Channel Notification Templates
CREATE TABLE IF NOT EXISTS notification_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_code VARCHAR(100) NOT NULL,
    channel VARCHAR(32) NOT NULL DEFAULT 'EMAIL',
    subject VARCHAR(255) NULL,
    body_template TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_notif_templates_code_chan UNIQUE (template_code, channel),
    CONSTRAINT chk_notif_templates_chan CHECK (channel IN ('EMAIL', 'SMS', 'PUSH', 'IN_APP'))
);

CREATE INDEX IF NOT EXISTS idx_notif_templates_code ON notification_templates(template_code);

CREATE TRIGGER trg_notif_templates_updated_at
BEFORE UPDATE ON notification_templates
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- 2. User Notification Preferences Matrix
CREATE TABLE IF NOT EXISTS notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    channel VARCHAR(32) NOT NULL,
    notification_category VARCHAR(50) NOT NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_notif_pref_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT uq_notif_pref_user_chan_cat UNIQUE (user_id, channel, notification_category),
    CONSTRAINT chk_notif_pref_chan CHECK (channel IN ('EMAIL', 'SMS', 'PUSH', 'IN_APP'))
);

CREATE INDEX IF NOT EXISTS idx_notif_pref_user ON notification_preferences(user_id);

CREATE TRIGGER trg_notif_pref_updated_at
BEFORE UPDATE ON notification_preferences
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- 3. Master Notification Dispatch Queue & Inbox
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    channel VARCHAR(32) NOT NULL DEFAULT 'IN_APP',
    category VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
    status VARCHAR(32) NOT NULL DEFAULT 'QUEUED',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    scheduled_for TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMPTZ NULL,
    read_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT chk_notifications_chan CHECK (channel IN ('EMAIL', 'SMS', 'PUSH', 'IN_APP')),
    CONSTRAINT chk_notifications_status CHECK (status IN ('QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'READ'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_queue ON notifications (status, scheduled_for) WHERE status = 'QUEUED';
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id) WHERE read_at IS NULL;

-- 4. Notification Gateway Delivery Attempts Log
CREATE TABLE IF NOT EXISTS notification_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID NOT NULL,
    recipient VARCHAR(255) NOT NULL,
    provider VARCHAR(50) NOT NULL,
    provider_message_id VARCHAR(255) NULL,
    delivery_status VARCHAR(32) NOT NULL DEFAULT 'INITIATED',
    error_message TEXT NULL,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    delivered_at TIMESTAMPTZ NULL,
    CONSTRAINT fk_notif_deliveries_notif FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notif_deliveries_notif ON notification_deliveries(notification_id);

-- Record migration
INSERT INTO schema_migrations (version, description, script, execution_time_ms, success)
VALUES ('V020', 'notifications', 'V020__notifications.sql', 0, TRUE)
ON CONFLICT (version) DO NOTHING;

COMMIT;
