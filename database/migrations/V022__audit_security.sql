-- =============================================================================
-- MOVANA PLATFORM DATABASE MIGRATION
-- Migration: V022__audit_security.sql
-- Description: Master immutable change-data-capture audit logs, state transition
--              automation functions, reference generators, and audit triggers.
-- Database Engine: PostgreSQL 16
-- =============================================================================

BEGIN;

DO $$
BEGIN
    IF current_database() <> 'movana' THEN
        RAISE EXCEPTION 'CRITICAL: Migration must run strictly inside "movana" database. Current: %', current_database();
    END IF;
END $$;

-- 1. Master System Audit Log Ledger (Append-Only)
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id UUID NULL,
    action VARCHAR(32) NOT NULL,
    entity_type VARCHAR(64) NOT NULL,
    entity_id UUID NOT NULL,
    old_values JSONB NULL,
    new_values JSONB NULL,
    ip_address INET NULL,
    user_agent TEXT NULL,
    request_id VARCHAR(64) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_audit_logs_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_audit_logs_action CHECK (action IN ('INSERT', 'UPDATE', 'DELETE', 'STATE_TRANSITION'))
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_time ON audit_logs(created_at DESC);

COMMENT ON TABLE audit_logs IS 'Immutable compliance audit trail recording who changed what and when with JSONB before/after values.';

-- 2. Audit Logging Trigger Function
CREATE OR REPLACE FUNCTION fn_record_audit_log()
RETURNS TRIGGER AS $$
DECLARE
    v_old_data JSONB := NULL;
    v_new_data JSONB := NULL;
    v_actor_id UUID := NULL;
    v_action VARCHAR(32);
    v_entity_id UUID;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_action := 'INSERT';
        v_new_data := to_jsonb(NEW);
        v_entity_id := NEW.id;
    ELSIF TG_OP = 'UPDATE' THEN
        v_action := 'UPDATE';
        v_old_data := to_jsonb(OLD);
        v_new_data := to_jsonb(NEW);
        v_entity_id := NEW.id;
    ELSIF TG_OP = 'DELETE' THEN
        v_action := 'DELETE';
        v_old_data := to_jsonb(OLD);
        v_entity_id := OLD.id;
    END IF;

    -- Attempt to read session actor if set in application context
    BEGIN
        v_actor_id := NULLIF(current_setting('movana.current_user_id', true), '')::UUID;
    EXCEPTION WHEN OTHERS THEN
        v_actor_id := NULL;
    END;

    INSERT INTO audit_logs (
        actor_user_id,
        action,
        entity_type,
        entity_id,
        old_values,
        new_values
    ) VALUES (
        v_actor_id,
        v_action,
        TG_TABLE_NAME,
        v_entity_id,
        v_old_data,
        v_new_data
    );

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 3. Dedicated State Transition Recording Trigger Functions
CREATE OR REPLACE FUNCTION fn_log_booking_status_transition()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO booking_status_history (
            booking_id,
            old_status,
            new_status,
            reason,
            changed_by
        ) VALUES (
            NEW.id,
            OLD.status,
            NEW.status,
            'Automated state transition trigger',
            NULL
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_log_trip_status_transition()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO trip_status_history (
            trip_id,
            old_status,
            new_status,
            reason,
            changed_by
        ) VALUES (
            NEW.id,
            OLD.status,
            NEW.status,
            'Automated state transition trigger',
            NULL
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. PNR Booking Reference Generator
CREATE OR REPLACE FUNCTION fn_generate_booking_reference()
RETURNS VARCHAR(32) AS $$
DECLARE
    chars TEXT := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    result TEXT := 'MOV-';
    i INTEGER;
BEGIN
    FOR i IN 1..4 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;
    result := result || '-';
    FOR i IN 1..4 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- 5. Fiscal Tax Invoice Number Generator
CREATE OR REPLACE FUNCTION fn_generate_invoice_number()
RETURNS VARCHAR(64) AS $$
DECLARE
    v_year TEXT := to_char(CURRENT_DATE, 'YYYY');
    v_random TEXT := upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6));
BEGIN
    RETURN 'INV-' || v_year || '-' || v_random;
END;
$$ LANGUAGE plpgsql;

-- 6. Trip Available Seat Calculator Function
CREATE OR REPLACE FUNCTION fn_calculate_trip_available_seats(p_trip_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_total_seats INTEGER;
    v_occupied_seats INTEGER;
BEGIN
    -- Get bus capacity
    SELECT COALESCE(v.seat_capacity, 0)
    INTO v_total_seats
    FROM trips t
    JOIN vehicles v ON t.vehicle_id = v.id
    WHERE t.id = p_trip_id;

    IF v_total_seats IS NULL OR v_total_seats = 0 THEN
        RETURN 0;
    END IF;

    -- Count active bookings
    SELECT COUNT(*)
    INTO v_occupied_seats
    FROM booking_seats bs
    WHERE bs.trip_id = p_trip_id
      AND bs.status IN ('PENDING', 'CONFIRMED');

    RETURN GREATEST(0, v_total_seats - v_occupied_seats);
END;
$$ LANGUAGE plpgsql;

-- 7. Attach Change-Data-Capture Audit Triggers
CREATE TRIGGER trg_users_audit
AFTER INSERT OR UPDATE OR DELETE ON users
FOR EACH ROW EXECUTE FUNCTION fn_record_audit_log();

CREATE TRIGGER trg_drivers_audit
AFTER UPDATE OR DELETE ON drivers
FOR EACH ROW EXECUTE FUNCTION fn_record_audit_log();

CREATE TRIGGER trg_vehicles_audit
AFTER UPDATE OR DELETE ON vehicles
FOR EACH ROW EXECUTE FUNCTION fn_record_audit_log();

CREATE TRIGGER trg_routes_audit
AFTER UPDATE OR DELETE ON routes
FOR EACH ROW EXECUTE FUNCTION fn_record_audit_log();

CREATE TRIGGER trg_trips_audit
AFTER UPDATE OR DELETE ON trips
FOR EACH ROW EXECUTE FUNCTION fn_record_audit_log();

CREATE TRIGGER trg_bookings_audit
AFTER UPDATE OR DELETE ON bookings
FOR EACH ROW EXECUTE FUNCTION fn_record_audit_log();

CREATE TRIGGER trg_payments_audit
AFTER UPDATE OR DELETE ON payments
FOR EACH ROW EXECUTE FUNCTION fn_record_audit_log();

CREATE TRIGGER trg_refunds_audit
AFTER UPDATE OR DELETE ON refunds
FOR EACH ROW EXECUTE FUNCTION fn_record_audit_log();

CREATE TRIGGER trg_incidents_audit
AFTER UPDATE OR DELETE ON incidents
FOR EACH ROW EXECUTE FUNCTION fn_record_audit_log();

-- 8. Attach Lifecycle State Transition Triggers
CREATE TRIGGER trg_bookings_status_hist
AFTER UPDATE OF status ON bookings
FOR EACH ROW EXECUTE FUNCTION fn_log_booking_status_transition();

CREATE TRIGGER trg_trips_status_hist
AFTER UPDATE OF status ON trips
FOR EACH ROW EXECUTE FUNCTION fn_log_trip_status_transition();

-- Record migration
INSERT INTO schema_migrations (version, description, script, execution_time_ms, success)
VALUES ('V022', 'audit_security', 'V022__audit_security.sql', 0, TRUE)
ON CONFLICT (version) DO NOTHING;

COMMIT;
