-- =============================================================================
-- MOVANA PLATFORM DATABASE MIGRATION
-- Migration: V021__reviews_support_lost_found.sql
-- Description: Passenger feedback and reviews, official responses, customer
--              care support tickets, message threads, and lost-and-found registry.
-- Database Engine: PostgreSQL 16
-- =============================================================================

BEGIN;

DO $$
BEGIN
    IF current_database() <> 'movana' THEN
        RAISE EXCEPTION 'CRITICAL: Migration must run strictly inside "movana" database. Current: %', current_database();
    END IF;
END $$;

-- 1. Review Categories Catalog
CREATE TABLE IF NOT EXISTS review_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_review_categories_code UNIQUE (code)
);

-- 2. Verified Passenger Reviews
CREATE TABLE IF NOT EXISTS reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    booking_id UUID NOT NULL,
    trip_id UUID NOT NULL,
    driver_id UUID NULL,
    vehicle_id UUID NULL,
    rating SMALLINT NOT NULL,
    comment TEXT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'PUBLISHED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_reviews_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_reviews_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE RESTRICT,
    CONSTRAINT fk_reviews_trip FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE RESTRICT,
    CONSTRAINT fk_reviews_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL,
    CONSTRAINT fk_reviews_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL,
    CONSTRAINT uq_reviews_booking UNIQUE (booking_id),
    CONSTRAINT chk_reviews_rating CHECK (rating BETWEEN 1 AND 5),
    CONSTRAINT chk_reviews_status CHECK (status IN ('PENDING', 'PUBLISHED', 'MODERATED', 'HIDDEN'))
);

CREATE INDEX IF NOT EXISTS idx_reviews_driver ON reviews(driver_id);
CREATE INDEX IF NOT EXISTS idx_reviews_trip ON reviews(trip_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews(user_id);

CREATE TRIGGER trg_reviews_updated_at
BEFORE UPDATE ON reviews
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- 3. Management Review Responses
CREATE TABLE IF NOT EXISTS review_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id UUID NOT NULL,
    responder_id UUID NOT NULL,
    response_text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_review_resp_review FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
    CONSTRAINT fk_review_resp_user FOREIGN KEY (responder_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT uq_review_resp_review UNIQUE (review_id)
);

CREATE INDEX IF NOT EXISTS idx_review_resp_review ON review_responses(review_id);

CREATE TRIGGER trg_review_resp_updated_at
BEFORE UPDATE ON review_responses
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- 4. Customer Support Tickets
CREATE TABLE IF NOT EXISTS support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_number VARCHAR(64) NOT NULL,
    user_id UUID NOT NULL,
    booking_id UUID NULL,
    trip_id UUID NULL,
    category VARCHAR(50) NOT NULL,
    subject VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    priority VARCHAR(32) NOT NULL DEFAULT 'MEDIUM',
    status VARCHAR(32) NOT NULL DEFAULT 'OPEN',
    assigned_to UUID NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_support_tickets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_support_tickets_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
    CONSTRAINT fk_support_tickets_trip FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE SET NULL,
    CONSTRAINT fk_support_tickets_agent FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT uq_support_tickets_num UNIQUE (ticket_number),
    CONSTRAINT chk_support_tickets_priority CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
    CONSTRAINT chk_support_tickets_status CHECK (status IN ('OPEN', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'RESOLVED', 'CLOSED'))
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_num ON support_tickets(ticket_number);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);

CREATE TRIGGER trg_support_tickets_updated_at
BEFORE UPDATE ON support_tickets
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- 5. Support Ticket Conversation Messages
CREATE TABLE IF NOT EXISTS support_ticket_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL,
    sender_id UUID NOT NULL,
    message TEXT NOT NULL,
    is_internal BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_support_messages_ticket FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
    CONSTRAINT fk_support_messages_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON support_ticket_messages(ticket_id);

-- 6. Support Ticket Lifecycle Status History
CREATE TABLE IF NOT EXISTS support_ticket_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL,
    old_status VARCHAR(32) NOT NULL,
    new_status VARCHAR(32) NOT NULL,
    changed_by UUID NULL,
    notes TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_support_status_hist_ticket FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
    CONSTRAINT fk_support_status_hist_user FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_support_status_hist_ticket ON support_ticket_status_history (ticket_id, created_at DESC);

-- 7. Support Ticket Attachments (Mapping Table)
CREATE TABLE IF NOT EXISTS support_ticket_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_message_id UUID NOT NULL,
    file_attachment_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_support_attach_msg FOREIGN KEY (ticket_message_id) REFERENCES support_ticket_messages(id) ON DELETE CASCADE
    -- Note: fk_support_attach_file to file_attachments is added in V023 after file_attachments is created
);

CREATE INDEX IF NOT EXISTS idx_support_attach_msg ON support_ticket_attachments(ticket_message_id);

-- 8. Lost and Found Master Reports
CREATE TABLE IF NOT EXISTS lost_found_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_number VARCHAR(64) NOT NULL,
    trip_id UUID NULL,
    vehicle_id UUID NULL,
    passenger_id UUID NULL,
    item_category VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    lost_at_stop_id UUID NULL,
    reported_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    found_at TIMESTAMPTZ NULL,
    claimed_at TIMESTAMPTZ NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'REPORTED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_lost_found_trip FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE SET NULL,
    CONSTRAINT fk_lost_found_veh FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL,
    CONSTRAINT fk_lost_found_user FOREIGN KEY (passenger_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_lost_found_stop FOREIGN KEY (lost_at_stop_id) REFERENCES stops(id) ON DELETE SET NULL,
    CONSTRAINT uq_lost_found_num UNIQUE (report_number),
    CONSTRAINT chk_lost_found_status CHECK (status IN ('REPORTED', 'FOUND_IN_STORAGE', 'CLAIMED', 'AUCTIONED_DISPOSED', 'UNRESOLVED'))
);

CREATE INDEX IF NOT EXISTS idx_lost_found_num ON lost_found_reports(report_number);
CREATE INDEX IF NOT EXISTS idx_lost_found_trip ON lost_found_reports(trip_id);

CREATE TRIGGER trg_lost_found_updated_at
BEFORE UPDATE ON lost_found_reports
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- 9. Lost and Found Physical Item Inventory
CREATE TABLE IF NOT EXISTS lost_found_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL,
    item_name VARCHAR(150) NOT NULL,
    description TEXT NOT NULL,
    storage_location VARCHAR(100) NOT NULL,
    condition VARCHAR(50) NOT NULL DEFAULT 'GOOD',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_lost_found_items_report FOREIGN KEY (report_id) REFERENCES lost_found_reports(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_lost_found_items_report ON lost_found_items(report_id);

CREATE TRIGGER trg_lost_found_items_updated_at
BEFORE UPDATE ON lost_found_items
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- 10. Lost and Found Custody Status History
CREATE TABLE IF NOT EXISTS lost_found_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL,
    old_status VARCHAR(32) NOT NULL,
    new_status VARCHAR(32) NOT NULL,
    notes TEXT NULL,
    changed_by UUID NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_lost_found_hist_report FOREIGN KEY (report_id) REFERENCES lost_found_reports(id) ON DELETE CASCADE,
    CONSTRAINT fk_lost_found_hist_user FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_lost_found_hist_report ON lost_found_status_history(report_id);

-- Record migration
INSERT INTO schema_migrations (version, description, script, execution_time_ms, success)
VALUES ('V021', 'reviews_support_lost_found', 'V021__reviews_support_lost_found.sql', 0, TRUE)
ON CONFLICT (version) DO NOTHING;

COMMIT;
