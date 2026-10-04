-- =============================================================================
-- MOVANA PLATFORM DATABASE MIGRATION
-- Migration: V013__schedules_calendars.sql
-- Description: Service calendars, holiday exceptions, recurring timetable schedules,
--              and intermediate stop timing profiles.
-- Database Engine: PostgreSQL 16
-- =============================================================================

BEGIN;

DO $$
BEGIN
    IF current_database() <> 'movana' THEN
        RAISE EXCEPTION 'CRITICAL: Migration must run strictly inside "movana" database. Current: %', current_database();
    END IF;
END $$;

-- 1. Master Service Calendars Table
CREATE TABLE IF NOT EXISTS service_calendars (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    calendar_name VARCHAR(100) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    monday BOOLEAN NOT NULL DEFAULT TRUE,
    tuesday BOOLEAN NOT NULL DEFAULT TRUE,
    wednesday BOOLEAN NOT NULL DEFAULT TRUE,
    thursday BOOLEAN NOT NULL DEFAULT TRUE,
    friday BOOLEAN NOT NULL DEFAULT TRUE,
    saturday BOOLEAN NOT NULL DEFAULT TRUE,
    sunday BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_service_cal_dates CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_service_cal_range ON service_calendars (start_date, end_date);

CREATE TRIGGER trg_service_cal_updated_at
BEFORE UPDATE ON service_calendars
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- 2. Service Calendar Exceptions Table
CREATE TABLE IF NOT EXISTS service_calendar_exceptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_calendar_id UUID NOT NULL,
    exception_date DATE NOT NULL,
    exception_type VARCHAR(20) NOT NULL DEFAULT 'REMOVED',
    description VARCHAR(255) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_service_cal_exc_cal FOREIGN KEY (service_calendar_id) REFERENCES service_calendars(id) ON DELETE CASCADE,
    CONSTRAINT uq_service_cal_exc_cal_date UNIQUE (service_calendar_id, exception_date),
    CONSTRAINT chk_service_cal_exc_type CHECK (exception_type IN ('ADDED', 'REMOVED'))
);

CREATE INDEX IF NOT EXISTS idx_service_cal_exc_date ON service_calendar_exceptions(exception_date);

-- 3. Master Trip Schedules (Timetables)
CREATE TABLE IF NOT EXISTS trip_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_code VARCHAR(50) NOT NULL,
    route_id UUID NOT NULL,
    service_calendar_id UUID NOT NULL,
    departure_time TIME NOT NULL,
    arrival_time TIME NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_trip_schedules_route FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE RESTRICT,
    CONSTRAINT fk_trip_schedules_cal FOREIGN KEY (service_calendar_id) REFERENCES service_calendars(id) ON DELETE RESTRICT,
    CONSTRAINT uq_trip_schedules_code UNIQUE (schedule_code)
);

CREATE INDEX IF NOT EXISTS idx_trip_schedules_route ON trip_schedules(route_id);
CREATE INDEX IF NOT EXISTS idx_trip_schedules_cal ON trip_schedules(service_calendar_id);

CREATE TRIGGER trg_trip_schedules_updated_at
BEFORE UPDATE ON trip_schedules
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- 4. Schedule Intermediate Stops Timing Offsets
CREATE TABLE IF NOT EXISTS schedule_stops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id UUID NOT NULL,
    stop_id UUID NOT NULL,
    sequence_number INTEGER NOT NULL,
    scheduled_arrival_offset_minutes INTEGER NOT NULL DEFAULT 0,
    scheduled_departure_offset_minutes INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_sched_stops_sched FOREIGN KEY (schedule_id) REFERENCES trip_schedules(id) ON DELETE CASCADE,
    CONSTRAINT fk_sched_stops_stop FOREIGN KEY (stop_id) REFERENCES stops(id) ON DELETE RESTRICT,
    CONSTRAINT uq_sched_stops_sched_seq UNIQUE (schedule_id, sequence_number)
);

CREATE INDEX IF NOT EXISTS idx_sched_stops_sched ON schedule_stops(schedule_id);

-- Record migration
INSERT INTO schema_migrations (version, description, script, execution_time_ms, success)
VALUES ('V013', 'schedules_calendars', 'V013__schedules_calendars.sql', 0, TRUE)
ON CONFLICT (version) DO NOTHING;

COMMIT;
