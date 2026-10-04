-- =============================================================================
-- MOVANA PLATFORM DATABASE MIGRATION
-- Migration: V015__bookings.sql
-- Description: Passenger reservations, ticket passenger metadata, fare line items,
--              seat allocation with concurrency exclusion shield, status history,
--              cancellations, and booking rescheduling.
-- Database Engine: PostgreSQL 16
-- =============================================================================

BEGIN;

DO $$
BEGIN
    IF current_database() <> 'movana' THEN
        RAISE EXCEPTION 'CRITICAL: Migration must run strictly inside "movana" database. Current: %', current_database();
    END IF;
END $$;

-- 1. Master Bookings Table (Immutable Order Record)
CREATE TABLE IF NOT EXISTS bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_reference VARCHAR(32) NOT NULL,
    user_id UUID NOT NULL,
    trip_id UUID NOT NULL,
    origin_stop_id UUID NOT NULL,
    destination_stop_id UUID NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    subtotal NUMERIC(10,2) NOT NULL,
    discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    tax_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    service_fee NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(10,2) NOT NULL,
    payment_status VARCHAR(32) NOT NULL DEFAULT 'UNPAID',
    booked_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMPTZ NULL,
    cancelled_at TIMESTAMPTZ NULL,
    completed_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_bookings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_bookings_trip FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE RESTRICT,
    CONSTRAINT fk_bookings_orig FOREIGN KEY (origin_stop_id) REFERENCES stops(id) ON DELETE RESTRICT,
    CONSTRAINT fk_bookings_dest FOREIGN KEY (destination_stop_id) REFERENCES stops(id) ON DELETE RESTRICT,
    CONSTRAINT uq_bookings_ref UNIQUE (booking_reference),
    CONSTRAINT chk_bookings_status CHECK (status IN ('PENDING', 'CONFIRMED', 'PARTIALLY_CONFIRMED', 'CANCELLED', 'COMPLETED', 'EXPIRED', 'REFUNDED')),
    CONSTRAINT chk_bookings_pay_status CHECK (payment_status IN ('UNPAID', 'PENDING', 'AUTHORIZED', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'FAILED')),
    CONSTRAINT chk_bookings_totals CHECK (total_amount = (subtotal - discount_amount + tax_amount + service_fee)),
    CONSTRAINT chk_bookings_amounts CHECK (subtotal >= 0 AND discount_amount >= 0 AND tax_amount >= 0 AND total_amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_bookings_ref ON bookings(booking_reference);
CREATE INDEX IF NOT EXISTS idx_bookings_user_time ON bookings (user_id, booked_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_trip ON bookings(trip_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);

CREATE TRIGGER trg_bookings_updated_at
BEFORE UPDATE ON bookings
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- 2. Named Booking Passengers Table
CREATE TABLE IF NOT EXISTS booking_passengers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL,
    passenger_name VARCHAR(100) NOT NULL,
    passenger_phone VARCHAR(32) NULL,
    passenger_email VARCHAR(255) NULL,
    date_of_birth DATE NULL,
    gender VARCHAR(20) NULL,
    special_requirements TEXT NULL,
    id_type VARCHAR(50) NULL,
    id_last4 VARCHAR(4) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_booking_passengers_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_booking_passengers_booking ON booking_passengers(booking_id);

CREATE TRIGGER trg_booking_passengers_updated_at
BEFORE UPDATE ON booking_passengers
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- 3. Booking Line Items Table
CREATE TABLE IF NOT EXISTS booking_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL,
    item_type VARCHAR(32) NOT NULL DEFAULT 'SEAT_FARE',
    description VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price NUMERIC(10,2) NOT NULL,
    total_price NUMERIC(10,2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_booking_items_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
    CONSTRAINT chk_booking_items_totals CHECK (total_price = (quantity * unit_price)),
    CONSTRAINT chk_booking_items_qty CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS idx_booking_items_booking ON booking_items(booking_id);

-- 4. Booking Seats Table (With Critical Concurrency Shield)
CREATE TABLE IF NOT EXISTS booking_seats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL,
    trip_id UUID NOT NULL,
    seat_id UUID NOT NULL,
    passenger_id UUID NOT NULL,
    fare_amount NUMERIC(10,2) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_booking_seats_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
    CONSTRAINT fk_booking_seats_trip FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE RESTRICT,
    CONSTRAINT fk_booking_seats_seat FOREIGN KEY (seat_id) REFERENCES seats(id) ON DELETE RESTRICT,
    CONSTRAINT fk_booking_seats_passenger FOREIGN KEY (passenger_id) REFERENCES booking_passengers(id) ON DELETE CASCADE,
    CONSTRAINT uq_booking_seats_booking_seat UNIQUE (booking_id, seat_id),
    CONSTRAINT chk_booking_seats_status CHECK (status IN ('PENDING', 'CONFIRMED', 'CANCELLED', 'RESCHEDULED'))
);

-- CRITICAL CONCURRENCY SHIELD:
-- Physically guarantees no two active (non-cancelled) reservations claim the same seat on a trip.
CREATE UNIQUE INDEX IF NOT EXISTS uq_booking_seats_active_trip_seat
ON booking_seats (trip_id, seat_id)
WHERE status IN ('PENDING', 'CONFIRMED');

CREATE INDEX IF NOT EXISTS idx_booking_seats_trip ON booking_seats(trip_id);

CREATE TRIGGER trg_booking_seats_updated_at
BEFORE UPDATE ON booking_seats
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- 5. Booking Status History Log
CREATE TABLE IF NOT EXISTS booking_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL,
    old_status VARCHAR(32) NOT NULL,
    new_status VARCHAR(32) NOT NULL,
    reason TEXT NULL,
    changed_by UUID NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_booking_status_hist_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
    CONSTRAINT fk_booking_status_hist_user FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_booking_status_hist_booking ON booking_status_history (booking_id, created_at DESC);

-- 6. Booking Cancellations Record
CREATE TABLE IF NOT EXISTS booking_cancellations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL,
    cancellation_reference VARCHAR(50) NOT NULL,
    reason TEXT NOT NULL,
    cancellation_fee NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    refund_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    cancelled_by UUID NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_booking_canc_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE RESTRICT,
    CONSTRAINT fk_booking_canc_user FOREIGN KEY (cancelled_by) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT uq_booking_canc_ref UNIQUE (cancellation_reference),
    CONSTRAINT uq_booking_canc_booking UNIQUE (booking_id),
    CONSTRAINT chk_booking_canc_amts CHECK (cancellation_fee >= 0 AND refund_amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_booking_canc_ref ON booking_cancellations(cancellation_reference);
CREATE INDEX IF NOT EXISTS idx_booking_canc_booking ON booking_cancellations(booking_id);

-- 7. Booking Reschedules Record
CREATE TABLE IF NOT EXISTS booking_reschedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    original_booking_id UUID NOT NULL,
    new_booking_id UUID NOT NULL,
    reason TEXT NULL,
    reschedule_fee NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    fare_difference NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    rescheduled_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_booking_resched_orig FOREIGN KEY (original_booking_id) REFERENCES bookings(id) ON DELETE RESTRICT,
    CONSTRAINT fk_booking_resched_new FOREIGN KEY (new_booking_id) REFERENCES bookings(id) ON DELETE RESTRICT,
    CONSTRAINT fk_booking_resched_user FOREIGN KEY (rescheduled_by) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT uq_booking_resched_orig UNIQUE (original_booking_id),
    CONSTRAINT chk_booking_resched_diff CHECK (original_booking_id <> new_booking_id)
);

CREATE INDEX IF NOT EXISTS idx_booking_resched_orig ON booking_reschedules(original_booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_resched_new ON booking_reschedules(new_booking_id);

-- Record migration
INSERT INTO schema_migrations (version, description, script, execution_time_ms, success)
VALUES ('V015', 'bookings', 'V015__bookings.sql', 0, TRUE)
ON CONFLICT (version) DO NOTHING;

COMMIT;
