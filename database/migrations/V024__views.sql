-- =============================================================================
-- MOVANA PLATFORM DATABASE MIGRATION
-- Migration: V024__views.sql
-- Description: Operational dispatch, seat availability, fleet telemetry,
--              financial reconciliation, and management reporting views.
-- Database Engine: PostgreSQL 16
-- =============================================================================

BEGIN;

DO $$
BEGIN
    IF current_database() <> 'movana' THEN
        RAISE EXCEPTION 'CRITICAL: Migration must run strictly inside "movana" database. Current: %', current_database();
    END IF;
END $$;

-- 1. Available Trip Seats View
CREATE OR REPLACE VIEW vw_available_trip_seats AS
SELECT 
    t.id AS trip_id,
    t.trip_number,
    t.scheduled_departure_at,
    v.id AS vehicle_id,
    v.registration_number,
    s.id AS seat_id,
    s.seat_number,
    s.deck,
    s.row_number,
    s.column_number,
    s.seat_type,
    s.position,
    s.is_window,
    s.is_aisle,
    CASE 
        WHEN bs.id IS NOT NULL THEN 'RESERVED'
        ELSE 'AVAILABLE'
    END AS availability_status,
    bs.booking_id,
    bs.status AS reservation_status
FROM trips t
JOIN vehicles v ON t.vehicle_id = v.id
JOIN seats s ON s.vehicle_id = v.id OR (s.layout_id IS NOT NULL AND s.vehicle_id IS NULL)
LEFT JOIN booking_seats bs ON bs.trip_id = t.id 
    AND bs.seat_id = s.id 
    AND bs.status IN ('PENDING', 'CONFIRMED')
WHERE s.is_active = TRUE;

-- 2. Real-Time Operational Trip Status Dispatch Board
CREATE OR REPLACE VIEW vw_trip_current_status AS
SELECT 
    t.id AS trip_id,
    t.trip_number,
    r.route_code,
    r.name AS route_name,
    s_orig.name AS origin_stop,
    s_dest.name AS destination_stop,
    v.vehicle_code,
    v.registration_number,
    u_driver.first_name || ' ' || u_driver.last_name AS primary_driver_name,
    u_driver.phone AS driver_phone,
    t.scheduled_departure_at,
    t.scheduled_arrival_at,
    t.actual_departure_at,
    t.actual_arrival_at,
    t.delay_minutes,
    t.status AS trip_status,
    s_curr.name AS current_stop,
    t.current_latitude,
    t.current_longitude,
    t.updated_at AS last_telemetry_at
FROM trips t
JOIN routes r ON t.route_id = r.id
JOIN stops s_orig ON r.origin_stop_id = s_orig.id
JOIN stops s_dest ON r.destination_stop_id = s_dest.id
LEFT JOIN vehicles v ON t.vehicle_id = v.id
LEFT JOIN drivers d ON t.primary_driver_id = d.id
LEFT JOIN users u_driver ON d.user_id = u_driver.id
LEFT JOIN stops s_curr ON t.current_stop_id = s_curr.id;

-- 3. Active Fleet Vehicles Live Locator Feed
CREATE OR REPLACE VIEW vw_active_vehicle_locations AS
SELECT 
    v.id AS vehicle_id,
    v.vehicle_code,
    v.registration_number,
    vt.name AS vehicle_type,
    v.status AS vehicle_status,
    v.current_latitude,
    v.current_longitude,
    v.last_location_at,
    v.current_odometer,
    v.fuel_type,
    td.device_imei,
    t.id AS active_trip_id,
    t.trip_number AS active_trip_number,
    t.status AS active_trip_status
FROM vehicles v
JOIN vehicle_types vt ON v.vehicle_type_id = vt.id
LEFT JOIN tracking_devices td ON td.vehicle_id = v.id AND td.is_active = TRUE
LEFT JOIN trips t ON t.vehicle_id = v.id AND t.status IN ('BOARDING', 'IN_TRANSIT', 'DELAYED')
WHERE v.deleted_at IS NULL;

-- 4. Trip Booking & Occupancy Summary View
CREATE OR REPLACE VIEW vw_booking_summary AS
SELECT 
    t.id AS trip_id,
    t.trip_number,
    t.scheduled_departure_at,
    r.route_code,
    v.seat_capacity,
    COUNT(b.id) FILTER (WHERE b.status = 'CONFIRMED') AS confirmed_bookings,
    COUNT(b.id) FILTER (WHERE b.status = 'CANCELLED') AS cancelled_bookings,
    COUNT(bs.id) FILTER (WHERE bs.status = 'CONFIRMED') AS seats_booked,
    COALESCE(ROUND((COUNT(bs.id) FILTER (WHERE bs.status = 'CONFIRMED')::NUMERIC / NULLIF(v.seat_capacity, 0)) * 100, 2), 0) AS occupancy_percentage,
    COALESCE(SUM(b.total_amount) FILTER (WHERE b.status = 'CONFIRMED'), 0.00) AS gross_revenue
FROM trips t
JOIN routes r ON t.route_id = r.id
LEFT JOIN vehicles v ON t.vehicle_id = v.id
LEFT JOIN bookings b ON b.trip_id = t.id
LEFT JOIN booking_seats bs ON bs.booking_id = b.id
GROUP BY t.id, t.trip_number, t.scheduled_departure_at, r.route_code, v.seat_capacity;

-- 5. Financial Reconciliation & Payment Summary View
CREATE OR REPLACE VIEW vw_payment_summary AS
SELECT 
    date_trunc('day', p.created_at) AS transaction_date,
    p.currency,
    COUNT(p.id) AS total_payment_intents,
    COUNT(p.id) FILTER (WHERE p.status = 'CAPTURED') AS successful_captures,
    COUNT(p.id) FILTER (WHERE p.status = 'FAILED') AS failed_attempts,
    COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'CAPTURED'), 0.00) AS gross_captured_amount,
    COALESCE(SUM(r.amount) FILTER (WHERE r.status = 'SUCCEEDED'), 0.00) AS total_refunded_amount,
    COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'CAPTURED'), 0.00) - 
    COALESCE(SUM(r.amount) FILTER (WHERE r.status = 'SUCCEEDED'), 0.00) AS net_revenue
FROM payments p
LEFT JOIN refunds r ON r.payment_id = p.id
GROUP BY date_trunc('day', p.created_at), p.currency;

-- 6. Driver Performance & Trip Summary View
CREATE OR REPLACE VIEW vw_driver_trip_summary AS
SELECT 
    d.id AS driver_id,
    d.employee_code,
    u.first_name || ' ' || u.last_name AS driver_name,
    d.license_number,
    d.employment_status,
    d.rating_average,
    COUNT(t.id) AS total_assigned_trips,
    COUNT(t.id) FILTER (WHERE t.status = 'COMPLETED') AS completed_trips,
    COUNT(t.id) FILTER (WHERE t.status = 'CANCELLED') AS cancelled_trips,
    COALESCE(ROUND(AVG(t.delay_minutes) FILTER (WHERE t.status = 'COMPLETED'), 1), 0.0) AS avg_delay_minutes
FROM drivers d
JOIN users u ON d.user_id = u.id
LEFT JOIN trips t ON t.primary_driver_id = d.id
WHERE d.deleted_at IS NULL
GROUP BY d.id, d.employee_code, u.first_name, u.last_name, d.license_number, d.employment_status, d.rating_average;

-- 7. Vehicle Health & Maintenance Overview
CREATE OR REPLACE VIEW vw_vehicle_health_summary AS
SELECT 
    v.id AS vehicle_id,
    v.registration_number,
    v.vehicle_code,
    v.status AS fleet_status,
    v.current_odometer,
    COUNT(mr.id) AS total_maintenance_orders,
    COALESCE(SUM(mr.cost) FILTER (WHERE mr.status = 'COMPLETED'), 0.00) AS total_maintenance_spend,
    MAX(mr.completed_date) AS last_maintenance_date,
    MAX(vi.inspection_date) AS last_inspection_date,
    (SELECT status FROM vehicle_inspections WHERE vehicle_id = v.id ORDER BY inspection_date DESC LIMIT 1) AS last_inspection_status
FROM vehicles v
LEFT JOIN maintenance_records mr ON mr.vehicle_id = v.id
LEFT JOIN vehicle_inspections vi ON vi.vehicle_id = v.id
WHERE v.deleted_at IS NULL
GROUP BY v.id, v.registration_number, v.vehicle_code, v.status, v.current_odometer;

-- 8. Route Schedule Master Summary
CREATE OR REPLACE VIEW vw_route_schedule_summary AS
SELECT 
    ts.id AS schedule_id,
    ts.schedule_code,
    r.route_code,
    r.name AS route_name,
    s_orig.name AS origin_stop_name,
    s_dest.name AS destination_stop_name,
    ts.departure_time,
    ts.arrival_time,
    sc.calendar_name,
    sc.monday, sc.tuesday, sc.wednesday, sc.thursday, sc.friday, sc.saturday, sc.sunday,
    ts.is_active
FROM trip_schedules ts
JOIN routes r ON ts.route_id = r.id
JOIN stops s_orig ON r.origin_stop_id = s_orig.id
JOIN stops s_dest ON r.destination_stop_id = s_dest.id
JOIN service_calendars sc ON ts.service_calendar_id = sc.id;

-- Record migration
INSERT INTO schema_migrations (version, description, script, execution_time_ms, success)
VALUES ('V024', 'views', 'V024__views.sql', 0, TRUE)
ON CONFLICT (version) DO NOTHING;

COMMIT;
