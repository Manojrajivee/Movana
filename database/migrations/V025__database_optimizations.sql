-- ==============================================================================
-- DESIGN ONLY — NOT EXECUTED
-- Migration: V025__database_optimizations.sql
-- Description: Database Hardening, Index Pruning, FK Indexing, and GPS Partitioning
-- Target Database: movana (PostgreSQL 16)
--
-- Safety Notice:
--   - This migration file is for architectural review only.
--   - DO NOT EXECUTE against the live database without human authorization.
--   - All operations are strictly transaction-safe (runs within BEGIN ... COMMIT).
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- PRE-MIGRATION SAFETY CHECK ASSERTIONS
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF current_database() <> 'movana' THEN
        RAISE EXCEPTION 'SAFETY ABORT: Current database is %, expected movana', current_database();
    END IF;
END $$;

-- ==============================================================================
-- PART A: FOREIGN-KEY SUPPORTING INDEXES
-- Purpose: Accelerate high-frequency joins, prevent full table scans during parent
--          key DELETE/UPDATE checks, and optimize core business lookup paths.
-- ==============================================================================

-- A.1 Booking & Seat Management (High-Volume Core OLTP)
CREATE INDEX IF NOT EXISTS idx_booking_seats_passenger_id 
    ON public.booking_seats (passenger_id);
COMMENT ON INDEX public.idx_booking_seats_passenger_id IS 
    'Supports fk_booking_seats_passenger on booking_seats(passenger_id) -> booking_passengers(id)';

CREATE INDEX IF NOT EXISTS idx_booking_seats_seat_id 
    ON public.booking_seats (seat_id);
COMMENT ON INDEX public.idx_booking_seats_seat_id IS 
    'Supports fk_booking_seats_seat on booking_seats(seat_id) -> seats(id); critical for seat availability checks';

CREATE INDEX IF NOT EXISTS idx_bookings_origin_stop_id 
    ON public.bookings (origin_stop_id);
COMMENT ON INDEX public.idx_bookings_origin_stop_id IS 
    'Supports fk_bookings_orig on bookings(origin_stop_id) -> stops(id)';

CREATE INDEX IF NOT EXISTS idx_bookings_destination_stop_id 
    ON public.bookings (destination_stop_id);
COMMENT ON INDEX public.idx_bookings_destination_stop_id IS 
    'Supports fk_bookings_dest on bookings(destination_stop_id) -> stops(id)';

-- A.2 Transit Network & Route Topology
CREATE INDEX IF NOT EXISTS idx_routes_destination_stop_id 
    ON public.routes (destination_stop_id);
COMMENT ON INDEX public.idx_routes_destination_stop_id IS 
    'Supports fk_routes_dest on routes(destination_stop_id) -> stops(id); balances existing origin index';

CREATE INDEX IF NOT EXISTS idx_schedule_stops_stop_id 
    ON public.schedule_stops (stop_id);
COMMENT ON INDEX public.idx_schedule_stops_stop_id IS 
    'Supports fk_sched_stops_stop on schedule_stops(stop_id) -> stops(id)';

-- A.3 Trip Dispatch & Rostering
CREATE INDEX IF NOT EXISTS idx_trips_schedule_id 
    ON public.trips (schedule_id);
COMMENT ON INDEX public.idx_trips_schedule_id IS 
    'Supports fk_trips_schedule on trips(schedule_id) -> trip_schedules(id)';

CREATE INDEX IF NOT EXISTS idx_trips_secondary_driver_id 
    ON public.trips (secondary_driver_id);
COMMENT ON INDEX public.idx_trips_secondary_driver_id IS 
    'Supports fk_trips_driver2 on trips(secondary_driver_id) -> drivers(id)';

CREATE INDEX IF NOT EXISTS idx_trips_current_stop_id 
    ON public.trips (current_stop_id);
COMMENT ON INDEX public.idx_trips_current_stop_id IS 
    'Supports fk_trips_stop on trips(current_stop_id) -> stops(id)';

-- A.4 Trip Operations & Telemetry Events
CREATE INDEX IF NOT EXISTS idx_driver_safety_events_trip_id 
    ON public.driver_safety_events (trip_id);
COMMENT ON INDEX public.idx_driver_safety_events_trip_id IS 
    'Supports fk_driver_safety_trip on driver_safety_events(trip_id) -> trips(id)';

CREATE INDEX IF NOT EXISTS idx_geofence_events_trip_id 
    ON public.geofence_events (trip_id);
COMMENT ON INDEX public.idx_geofence_events_trip_id IS 
    'Supports fk_geofence_events_trip on geofence_events(trip_id) -> trips(id)';

CREATE INDEX IF NOT EXISTS idx_vehicle_assignments_trip_id 
    ON public.vehicle_assignments (trip_id);
COMMENT ON INDEX public.idx_vehicle_assignments_trip_id IS 
    'Supports fk_vehicle_assign_trip on vehicle_assignments(trip_id) -> trips(id)';

CREATE INDEX IF NOT EXISTS idx_vehicle_inspections_trip_id 
    ON public.vehicle_inspections (trip_id);
COMMENT ON INDEX public.idx_vehicle_inspections_trip_id IS 
    'Supports fk_vehicle_insp_trip on vehicle_inspections(trip_id) -> trips(id)';

-- A.5 Fare Rules & Fare Matrix
CREATE INDEX IF NOT EXISTS idx_fare_rules_route_id 
    ON public.fare_rules (route_id);
COMMENT ON INDEX public.idx_fare_rules_route_id IS 
    'Supports fk_fare_rules_route on fare_rules(route_id) -> routes(id)';

CREATE INDEX IF NOT EXISTS idx_trip_fares_origin_stop_id 
    ON public.trip_fares (origin_stop_id);
COMMENT ON INDEX public.idx_trip_fares_origin_stop_id IS 
    'Supports fk_trip_fares_orig on trip_fares(origin_stop_id) -> stops(id)';

CREATE INDEX IF NOT EXISTS idx_trip_fares_destination_stop_id 
    ON public.trip_fares (destination_stop_id);
COMMENT ON INDEX public.idx_trip_fares_destination_stop_id IS 
    'Supports fk_trip_fares_dest on trip_fares(destination_stop_id) -> stops(id)';

-- A.6 Support, Reviews & Driver Safety
CREATE INDEX IF NOT EXISTS idx_support_tickets_booking_id 
    ON public.support_tickets (booking_id);
COMMENT ON INDEX public.idx_support_tickets_booking_id IS 
    'Supports fk_support_tickets_booking on support_tickets(booking_id) -> bookings(id)';

CREATE INDEX IF NOT EXISTS idx_support_tickets_trip_id 
    ON public.support_tickets (trip_id);
COMMENT ON INDEX public.idx_support_tickets_trip_id IS 
    'Supports fk_support_tickets_trip on support_tickets(trip_id) -> trips(id)';

CREATE INDEX IF NOT EXISTS idx_incidents_driver_id 
    ON public.incidents (driver_id);
COMMENT ON INDEX public.idx_incidents_driver_id IS 
    'Supports fk_incidents_driver on incidents(driver_id) -> drivers(id)';

CREATE INDEX IF NOT EXISTS idx_reviews_vehicle_id 
    ON public.reviews (vehicle_id);
COMMENT ON INDEX public.idx_reviews_vehicle_id IS 
    'Supports fk_reviews_vehicle on reviews(vehicle_id) -> vehicles(id)';

-- A.7 Partitioned Telemetry Driver Lookups
CREATE INDEX IF NOT EXISTS idx_loc_hist_driver 
    ON public.vehicle_location_history (driver_id);
COMMENT ON INDEX public.idx_loc_hist_driver IS 
    'Supports fk_loc_hist_driver on vehicle_location_history(driver_id) -> drivers(id); cascades to partitions';


-- ==============================================================================
-- PART B: REDUNDANT & DUPLICATE INDEX CLEANUP
-- Purpose: Remove exact duplicate standalone indexes that duplicate UNIQUE
--          constraint backing indexes, and remove leftmost-prefix redundancies.
-- Safety:  UNIQUE constraints remain 100% enforced by their uq_* backing indexes.
-- ==============================================================================

-- B.1 Prune 29 Exact Duplicate B-Tree Indexes
DROP INDEX IF EXISTS public.idx_booking_canc_booking;           -- Replaced by uq_booking_canc_booking
DROP INDEX IF EXISTS public.idx_booking_canc_ref;               -- Replaced by uq_booking_canc_ref
DROP INDEX IF EXISTS public.idx_booking_resched_orig;          -- Replaced by uq_booking_resched_orig
DROP INDEX IF EXISTS public.idx_bookings_ref;                  -- Replaced by uq_bookings_ref
DROP INDEX IF EXISTS public.idx_coupons_code;                  -- Replaced by uq_coupons_code
DROP INDEX IF EXISTS public.idx_discounts_code;                -- Replaced by uq_discounts_code
DROP INDEX IF EXISTS public.idx_driver_doc_types_code;         -- Replaced by uq_driver_doc_types_code
DROP INDEX IF EXISTS public.idx_drivers_emp_code;              -- Replaced by uq_drivers_emp_code
DROP INDEX IF EXISTS public.idx_drivers_license;               -- Replaced by uq_drivers_license
DROP INDEX IF EXISTS public.idx_fare_products_code;            -- Replaced by uq_fare_products_code
DROP INDEX IF EXISTS public.idx_feature_flags_key;             -- Replaced by uq_feature_flags_key
DROP INDEX IF EXISTS public.idx_incident_types_code;           -- Replaced by uq_incident_types_code
DROP INDEX IF EXISTS public.idx_incidents_num;                 -- Replaced by uq_incidents_num
DROP INDEX IF EXISTS public.idx_invoices_num;                  -- Replaced by uq_invoices_num
DROP INDEX IF EXISTS public.idx_lost_found_num;                -- Replaced by uq_lost_found_num
DROP INDEX IF EXISTS public.idx_passenger_profiles_user_id;    -- Replaced by uq_passenger_profiles_user
DROP INDEX IF EXISTS public.idx_payment_events_provider_event; -- Replaced by uq_payment_events_provider_event
DROP INDEX IF EXISTS public.idx_payments_ref;                  -- Replaced by uq_payments_ref
DROP INDEX IF EXISTS public.idx_refunds_ref;                   -- Replaced by uq_refunds_ref
DROP INDEX IF EXISTS public.idx_review_resp_review;            -- Replaced by uq_review_resp_review
DROP INDEX IF EXISTS public.idx_route_stops_route_seq;         -- Replaced by uq_route_stops_route_seq
DROP INDEX IF EXISTS public.idx_routes_code;                   -- Replaced by uq_routes_code
DROP INDEX IF EXISTS public.idx_stops_code;                    -- Replaced by uq_stops_code
DROP INDEX IF EXISTS public.idx_support_tickets_num;           -- Replaced by uq_support_tickets_num
DROP INDEX IF EXISTS public.idx_system_settings_key;           -- Replaced by uq_system_settings_key
DROP INDEX IF EXISTS public.idx_tracking_devices_imei;         -- Replaced by uq_tracking_devices_imei
DROP INDEX IF EXISTS public.idx_user_preferences_user_id;      -- Replaced by uq_user_preferences_user
DROP INDEX IF EXISTS public.idx_vehicle_types_code;            -- Replaced by uq_vehicle_types_code
DROP INDEX IF EXISTS public.idx_vehicles_reg_num;              -- Replaced by uq_vehicles_reg_num

-- B.2 Prune 9 Safe Leftmost-Prefix Redundant Indexes
DROP INDEX IF EXISTS public.idx_role_permissions_role_id;      -- Covered by uq_role_permissions_role_perm(role_id, permission_id)
DROP INDEX IF EXISTS public.idx_user_roles_user_id;            -- Covered by uq_user_roles_user_role(user_id, role_id)
DROP INDEX IF EXISTS public.idx_driver_docs_driver;            -- Covered by uq_driver_docs_type(driver_id, document_type_id)
DROP INDEX IF EXISTS public.idx_payment_attempts_payment;      -- Covered by uq_payment_attempts_num(payment_id, attempt_number)
DROP INDEX IF EXISTS public.idx_notif_templates_code;          -- Covered by uq_notif_templates_code_chan(template_code, channel)
DROP INDEX IF EXISTS public.idx_notif_pref_user;               -- Covered by uq_notif_pref_user_chan_cat(user_id, channel, category)
DROP INDEX IF EXISTS public.idx_vehicle_models_mfg;            -- Covered by uq_vehicle_models_mfg_name(manufacturer_id, name)
DROP INDEX IF EXISTS public.idx_sched_stops_sched;             -- Covered by uq_sched_stops_sched_seq(schedule_id, sequence_number)
DROP INDEX IF EXISTS public.idx_trip_stops_trip;               -- Covered by uq_trip_stops_trip_seq(trip_id, sequence_number)


-- ==============================================================================
-- PART C: FUNCTION SEARCH_PATH HARDENING
-- Purpose: Pin search_path to public, pg_temp to prevent schema hijacking
-- ==============================================================================

ALTER FUNCTION public.fn_calculate_trip_available_seats(uuid) 
    SET search_path = public, pg_temp;

ALTER FUNCTION public.fn_generate_booking_reference() 
    SET search_path = public, pg_temp;

ALTER FUNCTION public.fn_generate_invoice_number() 
    SET search_path = public, pg_temp;

ALTER FUNCTION public.fn_log_booking_status_transition() 
    SET search_path = public, pg_temp;

ALTER FUNCTION public.fn_log_trip_status_transition() 
    SET search_path = public, pg_temp;

ALTER FUNCTION public.fn_record_audit_log() 
    SET search_path = public, pg_temp;

ALTER FUNCTION public.fn_set_updated_at() 
    SET search_path = public, pg_temp;


-- ==============================================================================
-- PART D: GPS PARTITION MAINTENANCE & DATA MIGRATION
-- Purpose: Safely migrate 100 December 2026 telemetry rows out of DEFAULT,
--          create partitions for Dec 2026 through March 2027, and re-attach DEFAULT.
-- ==============================================================================

-- D.1 Detach the default partition
ALTER TABLE public.vehicle_location_history 
    DETACH PARTITION public.vehicle_location_history_default;

-- D.2 Create target monthly partitions
CREATE TABLE IF NOT EXISTS public.vehicle_location_history_y2026m12
    PARTITION OF public.vehicle_location_history
    FOR VALUES FROM ('2026-12-01 00:00:00+00') TO ('2027-01-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS public.vehicle_location_history_y2027m01
    PARTITION OF public.vehicle_location_history
    FOR VALUES FROM ('2027-01-01 00:00:00+00') TO ('2027-02-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS public.vehicle_location_history_y2027m02
    PARTITION OF public.vehicle_location_history
    FOR VALUES FROM ('2027-02-01 00:00:00+00') TO ('2027-03-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS public.vehicle_location_history_y2027m03
    PARTITION OF public.vehicle_location_history
    FOR VALUES FROM ('2027-03-01 00:00:00+00') TO ('2027-04-01 00:00:00+00');

-- D.3 Migrate December 2026 rows from detached default into the parent table
--     (PostgreSQL declarative router automatically inserts into y2026m12)
WITH moved_telemetry AS (
    DELETE FROM public.vehicle_location_history_default
    WHERE recorded_at >= '2026-12-01 00:00:00+00'
      AND recorded_at < '2027-01-01 00:00:00+00'
    RETURNING 
        id, vehicle_id, trip_id, driver_id, latitude, longitude,
        accuracy_meters, speed_kmh, heading_degrees, altitude_meters,
        odometer, recorded_at, received_at, source
)
INSERT INTO public.vehicle_location_history (
    id, vehicle_id, trip_id, driver_id, latitude, longitude,
    accuracy_meters, speed_kmh, heading_degrees, altitude_meters,
    odometer, recorded_at, received_at, source
)
SELECT 
    id, vehicle_id, trip_id, driver_id, latitude, longitude,
    accuracy_meters, speed_kmh, heading_degrees, altitude_meters,
    odometer, recorded_at, received_at, source
FROM moved_telemetry;

-- D.4 Verification assertion: Confirm default partition is now empty
DO $$
DECLARE
    v_remaining_count integer;
BEGIN
    SELECT count(*) INTO v_remaining_count FROM public.vehicle_location_history_default;
    IF v_remaining_count > 0 THEN
        RAISE EXCEPTION 'PARTITION INTEGRITY ERROR: % rows remain in default partition after migration', v_remaining_count;
    END IF;
END $$;

-- D.5 Re-attach the default partition
ALTER TABLE public.vehicle_location_history 
    ATTACH PARTITION public.vehicle_location_history_default DEFAULT;

-- ------------------------------------------------------------------------------
-- POST-MIGRATION RECORD INTEGRITY VERIFICATION
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_total_gps integer;
    v_dec_gps integer;
BEGIN
    SELECT count(*) INTO v_total_gps FROM public.vehicle_location_history;
    IF v_total_gps <> 1600 THEN
        RAISE EXCEPTION 'TELEMETRY ROW COUNT MISMATCH: Expected 1600 rows, found %', v_total_gps;
    END IF;

    SELECT count(*) INTO v_dec_gps FROM public.vehicle_location_history_y2026m12;
    IF v_dec_gps <> 100 THEN
        RAISE EXCEPTION 'DECEMBER PARTITION ROW COUNT MISMATCH: Expected 100 rows, found %', v_dec_gps;
    END IF;
END $$;

COMMIT;
