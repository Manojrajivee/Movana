-- =============================================================================
-- MOVANA PLATFORM SEED DATA: DEVELOPMENT / TEST DATA
-- File: database/seeds/development_data.sql
-- Description: Realistic simulated transit network for local engineering testing:
--              fictional users, buses, drivers, routes, schedules, and test orders.
-- Target Database: movana
-- Warning: FOR DEVELOPMENT / TESTING ONLY. CONTAINS NO REAL PERSONAL DATA.
-- =============================================================================

BEGIN;

DO $$
BEGIN
    IF current_database() <> 'movana' THEN
        RAISE EXCEPTION 'CRITICAL: Seeds must run strictly inside "movana" database. Current: %', current_database();
    END IF;
END $$;

-- 1. Demo Platform Users (Standard test password hash for 'Password123!')
-- Hash: $2a$10$wE9mN5Zz3lF9mN5Zz3lF9.wE9mN5Zz3lF9mN5Zz3lF9mN5Zz3lF9
INSERT INTO users (id, email, phone, password_hash, first_name, last_name, status, email_verified, phone_verified)
VALUES 
    ('a0000000-0000-0000-0000-000000000001', 'admin@movana.test', '+919876543210', '$2a$10$wE9mN5Zz3lF9mN5Zz3lF9.wE9mN5Zz3lF9mN5Zz3lF9mN5Zz3lF9', 'Ramesh', 'Admin', 'ACTIVE', TRUE, TRUE),
    ('a0000000-0000-0000-0000-000000000002', 'driver.kumar@movana.test', '+919876543211', '$2a$10$wE9mN5Zz3lF9mN5Zz3lF9.wE9mN5Zz3lF9mN5Zz3lF9mN5Zz3lF9', 'Suresh', 'Kumar', 'ACTIVE', TRUE, TRUE),
    ('a0000000-0000-0000-0000-000000000003', 'passenger.priya@movana.test', '+919876543212', '$2a$10$wE9mN5Zz3lF9mN5Zz3lF9.wE9mN5Zz3lF9mN5Zz3lF9mN5Zz3lF9', 'Priya', 'Sharma', 'ACTIVE', TRUE, TRUE)
ON CONFLICT (id) DO NOTHING;

-- 2. User Roles Assignment
INSERT INTO user_roles (user_id, role_id)
VALUES 
    ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001'), -- Ramesh as ADMIN
    ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003'), -- Suresh as DRIVER
    ('a0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000004')  -- Priya as PASSENGER
ON CONFLICT (user_id, role_id) DO NOTHING;

-- 3. Passenger Profile
INSERT INTO passenger_profiles (id, user_id, preferred_language, preferred_currency)
VALUES ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003', 'en', 'INR')
ON CONFLICT (user_id) DO NOTHING;

-- 4. Demo Professional Driver Profile
INSERT INTO drivers (id, user_id, employee_code, license_number, license_category, license_expiry_date, employment_status, verification_status, rating_average, total_trips)
VALUES (
    'c0000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000002',
    'EMP-BLR-001',
    'DL-KA01-20150009876',
    'HEAVY_PASSENGER',
    '2030-12-31',
    'ACTIVE',
    'VERIFIED',
    4.92,
    342
) ON CONFLICT (employee_code) DO NOTHING;

-- 5. Vehicle Model
INSERT INTO vehicle_models (id, manufacturer_id, name, release_year, default_capacity)
VALUES ('d0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '9400 B11R Multi-Axle', 2024, 40)
ON CONFLICT (manufacturer_id, name) DO NOTHING;

-- 6. Demo Bus Registration
INSERT INTO vehicles (
    id, registration_number, vehicle_code, vehicle_type_id, manufacturer_id, model_id,
    model_year, vin, engine_number, capacity, standing_capacity, seat_capacity,
    fuel_type, status, current_odometer, current_latitude, current_longitude, last_location_at
) VALUES (
    'e0000000-0000-0000-0000-000000000001',
    'KA-01-F-9988',
    'BUS-VOLVO-101',
    '21000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'd0000000-0000-0000-0000-000000000001',
    2024,
    'VOLVO9400B11R9887766',
    'D11C450ENG12345',
    40,
    0,
    40,
    'DIESEL',
    'ACTIVE',
    45230.50,
    12.9715987,
    77.5945627,
    CURRENT_TIMESTAMP
) ON CONFLICT (registration_number) DO NOTHING;

-- 7. Seat Layout & 40 Sample Seats
INSERT INTO seat_layouts (id, name, vehicle_type_id, total_rows, total_columns, total_decks)
VALUES ('f0000000-0000-0000-0000-000000000001', '40-Seat Executive 2x2 Layout', '21000000-0000-0000-0000-000000000001', 10, 4, 1)
ON CONFLICT (name) DO NOTHING;

-- Seed Seats for Bus
INSERT INTO seats (layout_id, vehicle_id, seat_number, row_number, column_number, seat_type, deck, position, is_window, is_aisle)
SELECT 
    'f0000000-0000-0000-0000-000000000001',
    'e0000000-0000-0000-0000-000000000001',
    r || chr(64 + c),
    r,
    c,
    'REGULAR',
    1,
    CASE WHEN c IN (1, 4) THEN 'WINDOW' ELSE 'AISLE' END,
    CASE WHEN c IN (1, 4) THEN TRUE ELSE FALSE END,
    CASE WHEN c IN (2, 3) THEN TRUE ELSE FALSE END
FROM generate_series(1, 10) r
CROSS JOIN generate_series(1, 4) c
ON CONFLICT DO NOTHING;

-- 8. Demo GPS Telematics Unit
INSERT INTO tracking_devices (id, device_imei, device_model, firmware_version, vehicle_id, is_active, installed_at)
VALUES (
    '80000000-0000-0000-0000-000000000001',
    '867530901234567',
    'Teltonika FMB120',
    'v03.28.02.Rev.00',
    'e0000000-0000-0000-0000-000000000001',
    TRUE,
    CURRENT_TIMESTAMP - INTERVAL '60 days'
) ON CONFLICT (device_imei) DO NOTHING;

-- 9. Major Transit Stops (Bangalore & Chennai)
INSERT INTO stops (id, stop_code, name, address, city, state, latitude, longitude, geofence_radius_meters, status)
VALUES 
    ('90000000-0000-0000-0000-000000000001', 'BLR-MAJ', 'Bangalore Majestic Central Bus Station', 'Kempegowda Bus Station, Gandhi Nagar', 'Bangalore', 'Karnataka', 12.9778210, 77.5727980, 150, 'ACTIVE'),
    ('90000000-0000-0000-0000-000000000002', 'BLR-EC', 'Electronic City Toll Plaza Boarding Point', 'Hosur Road, Electronic City Phase 1', 'Bangalore', 'Karnataka', 12.8452140, 77.6601680, 100, 'ACTIVE'),
    ('90000000-0000-0000-0000-000000000003', 'MAA-GND', 'Guindy Industrial Estate Bus Stop', 'GST Road, Guindy', 'Chennai', 'Tamil Nadu', 13.0066620, 80.2025610, 100, 'ACTIVE'),
    ('90000000-0000-0000-0000-000000000004', 'MAA-CMBT', 'Chennai Mofussil Bus Terminus (CMBT)', 'Jawaharlal Nehru Road, Koyambedu', 'Chennai', 'Tamil Nadu', 13.0694440, 80.2055560, 200, 'ACTIVE')
ON CONFLICT (stop_code) DO NOTHING;

-- 10. Master Route (Bangalore to Chennai Corridor)
INSERT INTO routes (id, route_code, name, description, origin_stop_id, destination_stop_id, distance_km, estimated_duration_minutes, status)
VALUES (
    '91000000-0000-0000-0000-000000000001',
    'RT-BLR-MAA-EXP',
    'Bangalore Majestic to Chennai CMBT Express',
    'Non-stop luxury AC express highway transit via Hosur and Krishnagiri',
    '90000000-0000-0000-0000-000000000001',
    '90000000-0000-0000-0000-000000000004',
    345.50,
    360,
    'ACTIVE'
) ON CONFLICT (route_code) DO NOTHING;

-- Route Sequence
INSERT INTO route_stops (route_id, stop_id, sequence_number, arrival_offset_minutes, departure_offset_minutes, distance_from_origin_km, is_boarding_allowed, is_dropoff_allowed)
VALUES 
    ('91000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', 1, 0, 0, 0.00, TRUE, FALSE),
    ('91000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000002', 2, 45, 50, 22.00, TRUE, FALSE),
    ('91000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000003', 3, 330, 335, 332.00, FALSE, TRUE),
    ('91000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000004', 4, 360, 360, 345.50, FALSE, TRUE)
ON CONFLICT (route_id, sequence_number) DO NOTHING;

-- 11. Daily Service Calendar
INSERT INTO service_calendars (id, calendar_name, start_date, end_date, monday, tuesday, wednesday, thursday, friday, saturday, sunday)
VALUES ('92000000-0000-0000-0000-000000000001', 'Standard Daily Interstate Service 2026', '2026-01-01', '2026-12-31', TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE)
ON CONFLICT DO NOTHING;

-- 12. Recurring Timetable Schedule
INSERT INTO trip_schedules (id, schedule_code, route_id, service_calendar_id, departure_time, arrival_time, is_active)
VALUES ('93000000-0000-0000-0000-000000000001', 'SCH-BLR-MAA-0600', '91000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', '06:00:00', '12:00:00', TRUE)
ON CONFLICT (schedule_code) DO NOTHING;

-- 13. Demo Upcoming Concrete Trip
INSERT INTO trips (
    id, trip_number, route_id, schedule_id, vehicle_id, primary_driver_id,
    scheduled_departure_at, scheduled_arrival_at, status, delay_minutes
) VALUES (
    '94000000-0000-0000-0000-000000000001',
    'TRIP-20260927-001',
    '91000000-0000-0000-0000-000000000001',
    '93000000-0000-0000-0000-000000000001',
    'e0000000-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000002',
    CURRENT_DATE + INTERVAL '1 day' + TIME '06:00:00',
    CURRENT_DATE + INTERVAL '1 day' + TIME '12:00:00',
    'SCHEDULED',
    0
) ON CONFLICT (trip_number) DO NOTHING;

-- 14. Demo Booking with Confirmed Seat
INSERT INTO bookings (
    id, booking_reference, user_id, trip_id, origin_stop_id, destination_stop_id,
    status, currency, subtotal, discount_amount, tax_amount, service_fee, total_amount, payment_status, booked_at, confirmed_at
) VALUES (
    '95000000-0000-0000-0000-000000000001',
    'MOV-TEST-8899',
    'a0000000-0000-0000-0000-000000000003',
    '94000000-0000-0000-0000-000000000001',
    '90000000-0000-0000-0000-000000000001',
    '90000000-0000-0000-0000-000000000004',
    'CONFIRMED',
    'INR',
    800.00,
    50.00,
    37.50,
    20.00,
    807.50,
    'PAID',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
) ON CONFLICT (booking_reference) DO NOTHING;

-- Booking Passenger
INSERT INTO booking_passengers (id, booking_id, passenger_name, passenger_phone, passenger_email, gender)
VALUES (
    '96000000-0000-0000-0000-000000000001',
    '95000000-0000-0000-0000-000000000001',
    'Priya Sharma',
    '+919876543212',
    'passenger.priya@movana.test',
    'FEMALE'
) ON CONFLICT (id) DO NOTHING;

-- Booking Seat Allocation (Reserved Seat 1A)
INSERT INTO booking_seats (
    id, booking_id, trip_id, seat_id, passenger_id, fare_amount, status
)
SELECT 
    '97000000-0000-0000-0000-000000000001',
    '95000000-0000-0000-0000-000000000001',
    '94000000-0000-0000-0000-000000000001',
    s.id,
    '96000000-0000-0000-0000-000000000001',
    800.00,
    'CONFIRMED'
FROM seats s
WHERE s.vehicle_id = 'e0000000-0000-0000-0000-000000000001'
  AND s.seat_number = '1A'
LIMIT 1
ON CONFLICT DO NOTHING;

-- 15. Demo Payment Record
INSERT INTO payments (
    id, booking_id, payment_reference, provider, provider_transaction_id,
    idempotency_key, amount, currency, status, payment_method, captured_at
) VALUES (
    '98000000-0000-0000-0000-000000000001',
    '95000000-0000-0000-0000-000000000001',
    'PAY-TEST-998877',
    'RAZORPAY_DEMO',
    'pay_demo_tx_123456789',
    'IDEMP-TEST-998877',
    807.50,
    'INR',
    'CAPTURED',
    'UPI',
    CURRENT_TIMESTAMP
) ON CONFLICT (payment_reference) DO NOTHING;

-- 16. Demo Tax Invoice
INSERT INTO invoices (
    id, invoice_number, booking_id, user_id, subtotal, tax, discount, total, currency, status, paid_at
) VALUES (
    '99000000-0000-0000-0000-000000000001',
    'INV-2026-TEST01',
    '95000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000003',
    820.00,
    37.50,
    50.00,
    807.50,
    'INR',
    'PAID',
    CURRENT_TIMESTAMP
) ON CONFLICT (invoice_number) DO NOTHING;

COMMIT;
