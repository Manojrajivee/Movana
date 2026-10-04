-- =============================================================================
-- MOVANA PLATFORM DATABASE MIGRATION
-- Migration: V011__seat_layouts.sql
-- Description: Bus seating layouts, grid dimensions, multi-deck configuration,
--              and individual physical seats.
-- Database Engine: PostgreSQL 16
-- =============================================================================

BEGIN;

DO $$
BEGIN
    IF current_database() <> 'movana' THEN
        RAISE EXCEPTION 'CRITICAL: Migration must run strictly inside "movana" database. Current: %', current_database();
    END IF;
END $$;

-- 1. Seat Layout Templates Table
CREATE TABLE IF NOT EXISTS seat_layouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    vehicle_type_id UUID NOT NULL,
    total_rows INTEGER NOT NULL,
    total_columns INTEGER NOT NULL,
    total_decks INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_seat_layouts_type FOREIGN KEY (vehicle_type_id) REFERENCES vehicle_types(id) ON DELETE RESTRICT,
    CONSTRAINT uq_seat_layouts_name UNIQUE (name),
    CONSTRAINT chk_seat_layouts_dims CHECK (total_rows > 0 AND total_columns > 0 AND total_decks IN (1, 2))
);

CREATE INDEX IF NOT EXISTS idx_seat_layouts_type ON seat_layouts(vehicle_type_id);

CREATE TRIGGER trg_seat_layouts_updated_at
BEFORE UPDATE ON seat_layouts
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- 2. Physical & Template Seats Table
CREATE TABLE IF NOT EXISTS seats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    layout_id UUID NOT NULL,
    vehicle_id UUID NULL,
    seat_number VARCHAR(10) NOT NULL,
    row_number INTEGER NOT NULL,
    column_number INTEGER NOT NULL,
    seat_type VARCHAR(32) NOT NULL DEFAULT 'REGULAR',
    deck INTEGER NOT NULL DEFAULT 1,
    position VARCHAR(32) NOT NULL DEFAULT 'WINDOW',
    is_window BOOLEAN NOT NULL DEFAULT FALSE,
    is_aisle BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_seats_layout FOREIGN KEY (layout_id) REFERENCES seat_layouts(id) ON DELETE CASCADE,
    CONSTRAINT fk_seats_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
    CONSTRAINT uq_seats_layout_deck_row_col UNIQUE (layout_id, deck, row_number, column_number),
    CONSTRAINT uq_seats_layout_number UNIQUE (layout_id, seat_number),
    CONSTRAINT chk_seats_type CHECK (seat_type IN ('REGULAR', 'PREMIUM', 'LADIES', 'ACCESSIBLE', 'DRIVER', 'CONDUCTOR', 'RESERVED')),
    CONSTRAINT chk_seats_deck CHECK (deck IN (1, 2))
);

CREATE INDEX IF NOT EXISTS idx_seats_layout ON seats(layout_id);
CREATE INDEX IF NOT EXISTS idx_seats_vehicle ON seats(vehicle_id);

CREATE TRIGGER trg_seats_updated_at
BEFORE UPDATE ON seats
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- Record migration
INSERT INTO schema_migrations (version, description, script, execution_time_ms, success)
VALUES ('V011', 'seat_layouts', 'V011__seat_layouts.sql', 0, TRUE)
ON CONFLICT (version) DO NOTHING;

COMMIT;
