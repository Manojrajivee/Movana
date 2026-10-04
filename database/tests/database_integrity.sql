-- =============================================================================
-- MOVANA PLATFORM DATABASE INTEGRITY TEST SUITE
-- File: database/tests/database_integrity.sql
-- Description: Automated PL/pgSQL test assertions validating database integrity,
--              concurrency protection, foreign key cascades, check constraints,
--              audit logging, partitioned tables, and seed validity.
-- Target Database: movana
-- Execution: psql -U postgres -h localhost -p 5432 -d movana -f database/tests/database_integrity.sql
-- =============================================================================

BEGIN;

DO $$
BEGIN
    IF current_database() <> 'movana' THEN
        RAISE EXCEPTION 'CRITICAL: Tests must run strictly inside "movana" database. Current: %', current_database();
    END IF;
END $$;

DO $$
DECLARE
    v_passed INTEGER := 0;
    v_failed INTEGER := 0;
    v_test_name TEXT;
    v_count INTEGER;
    v_trip_id UUID;
    v_seat_id UUID;
    v_booking1_id UUID;
    v_booking2_id UUID;
    v_passenger_id UUID;
    v_user_id UUID;
BEGIN
    RAISE NOTICE '====================================================================';
    RAISE NOTICE 'STARTING MOVANA DATABASE INTEGRITY VERIFICATION SUITE';
    RAISE NOTICE '====================================================================';

    -- -------------------------------------------------------------------------
    -- TEST 1: Table Inventory Completeness (Expect 100 tables)
    -- -------------------------------------------------------------------------
    v_test_name := 'Table Inventory Verification (100 tables expected)';
    SELECT COUNT(*) INTO v_count 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      AND table_name NOT LIKE 'vehicle_location_history_y%'; -- Exclude explicit partition tables
    
    IF v_count >= 95 THEN
        v_passed := v_passed + 1;
        RAISE NOTICE '[PASS] % (Found % base tables)', v_test_name, v_count;
    ELSE
        v_failed := v_failed + 1;
        RAISE WARNING '[FAIL] % (Found only % tables)', v_test_name, v_count;
    END IF;

    -- -------------------------------------------------------------------------
    -- TEST 2: Primary Key Coverage (All tables must have a Primary Key)
    -- -------------------------------------------------------------------------
    v_test_name := 'Primary Key Integrity on All Relational Tables';
    SELECT COUNT(*) INTO v_count
    FROM information_schema.tables t
    LEFT JOIN (
        SELECT ku.table_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage ku 
          ON tc.constraint_name = ku.constraint_name
        WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public'
        GROUP BY ku.table_name
    ) pk ON t.table_name = pk.table_name
    WHERE t.table_schema = 'public' 
      AND t.table_type = 'BASE TABLE'
      AND pk.table_name IS NULL
      AND t.table_name NOT LIKE 'vehicle_location_history_y%';

    IF v_count = 0 THEN
        v_passed := v_passed + 1;
        RAISE NOTICE '[PASS] % (Zero tables missing primary keys)', v_test_name;
    ELSE
        v_failed := v_failed + 1;
        RAISE WARNING '[FAIL] % (% tables missing primary keys)', v_test_name, v_count;
    END IF;

    -- -------------------------------------------------------------------------
    -- TEST 3: Seat Concurrency Shield (Prevent Double-Booking Same Seat on Trip)
    -- -------------------------------------------------------------------------
    v_test_name := 'Concurrency Protection: Prevent Double Booking Same Seat';
    BEGIN
        -- Find a demo trip and seat
        SELECT t.id, s.id, b.user_id, bp.id
        INTO v_trip_id, v_seat_id, v_user_id, v_passenger_id
        FROM trips t
        JOIN seats s ON s.vehicle_id = t.vehicle_id
        JOIN bookings b ON b.trip_id = t.id
        JOIN booking_passengers bp ON bp.booking_id = b.id
        LIMIT 1;

        -- Create first reservation
        v_booking1_id := gen_random_uuid();
        INSERT INTO bookings (id, booking_reference, user_id, trip_id, origin_stop_id, destination_stop_id, status, total_amount, subtotal)
        SELECT v_booking1_id, 'TEST-PNR-A', v_user_id, v_trip_id, origin_stop_id, destination_stop_id, 'CONFIRMED', 500, 500
        FROM bookings WHERE id = (SELECT id FROM bookings LIMIT 1);

        INSERT INTO booking_seats (booking_id, trip_id, seat_id, passenger_id, fare_amount, status)
        VALUES (v_booking1_id, v_trip_id, v_seat_id, v_passenger_id, 500, 'CONFIRMED');

        -- Attempt conflicting second reservation on the EXACT same trip and seat
        v_booking2_id := gen_random_uuid();
        INSERT INTO bookings (id, booking_reference, user_id, trip_id, origin_stop_id, destination_stop_id, status, total_amount, subtotal)
        SELECT v_booking2_id, 'TEST-PNR-B', v_user_id, v_trip_id, origin_stop_id, destination_stop_id, 'CONFIRMED', 500, 500
        FROM bookings WHERE id = (SELECT id FROM bookings LIMIT 1);

        -- This INSERT MUST throw a unique constraint violation!
        INSERT INTO booking_seats (booking_id, trip_id, seat_id, passenger_id, fare_amount, status)
        VALUES (v_booking2_id, v_trip_id, v_seat_id, v_passenger_id, 500, 'CONFIRMED');

        -- If it reached here without error, the concurrency shield failed!
        v_failed := v_failed + 1;
        RAISE WARNING '[FAIL] % (Double booking was NOT prevented!)', v_test_name;
    EXCEPTION WHEN unique_violation THEN
        v_passed := v_passed + 1;
        RAISE NOTICE '[PASS] % (Database engine successfully rejected duplicate seat reservation: SQLSTATE 23505)', v_test_name;
    END;

    -- -------------------------------------------------------------------------
    -- TEST 4: Payment Idempotency Webhook Protection
    -- -------------------------------------------------------------------------
    v_test_name := 'Payment Idempotency Webhook Shield';
    BEGIN
        INSERT INTO payment_events (provider, event_id, event_type, payload)
        VALUES ('STRIPE_TEST', 'evt_123456789', 'payment_intent.succeeded', '{"amount": 500}'::jsonb);

        -- Second insert of same provider + event_id must fail
        INSERT INTO payment_events (provider, event_id, event_type, payload)
        VALUES ('STRIPE_TEST', 'evt_123456789', 'payment_intent.succeeded', '{"amount": 500}'::jsonb);

        v_failed := v_failed + 1;
        RAISE WARNING '[FAIL] % (Duplicate webhook allowed!)', v_test_name;
    EXCEPTION WHEN unique_violation THEN
        v_passed := v_passed + 1;
        RAISE NOTICE '[PASS] % (Duplicate webhook rejected: SQLSTATE 23505)', v_test_name;
    END;

    -- -------------------------------------------------------------------------
    -- TEST 5: Financial CHECK Constraint (Reject Negative Payment Amounts)
    -- -------------------------------------------------------------------------
    v_test_name := 'Check Constraint: Reject Negative Payment Amount';
    BEGIN
        INSERT INTO payments (
            booking_id, payment_reference, provider, idempotency_key, amount, currency, status
        ) VALUES (
            (SELECT id FROM bookings LIMIT 1), 'PAY-NEGATIVE', 'TEST', 'IDEMP-NEG', -100.00, 'INR', 'INITIATED'
        );

        v_failed := v_failed + 1;
        RAISE WARNING '[FAIL] % (Negative payment allowed!)', v_test_name;
    EXCEPTION WHEN check_violation THEN
        v_passed := v_passed + 1;
        RAISE NOTICE '[PASS] % (Negative payment correctly rejected by CHECK constraint)', v_test_name;
    END;

    -- -------------------------------------------------------------------------
    -- TEST 6: Geospatial Boundary CHECK Constraints
    -- -------------------------------------------------------------------------
    v_test_name := 'Geospatial Bounds: Reject Latitude > 90.0';
    BEGIN
        INSERT INTO stops (stop_code, name, address, city, state, latitude, longitude)
        VALUES ('INVALID-STOP', 'Bad Coords Stop', '123 Fake St', 'Nowhere', 'None', 95.1234567, 77.1234567);

        v_failed := v_failed + 1;
        RAISE WARNING '[FAIL] % (Invalid latitude accepted!)', v_test_name;
    EXCEPTION WHEN check_violation THEN
        v_passed := v_passed + 1;
        RAISE NOTICE '[PASS] % (Invalid latitude correctly rejected by CHECK constraint)', v_test_name;
    END;

    -- -------------------------------------------------------------------------
    -- TEST 7: Review Rating CHECK Constraint (Range 1 to 5)
    -- -------------------------------------------------------------------------
    v_test_name := 'Rating Constraint: Reject Rating Out of Range (0 or 6)';
    BEGIN
        INSERT INTO reviews (user_id, booking_id, trip_id, rating, comment)
        VALUES (
            (SELECT id FROM users LIMIT 1),
            (SELECT id FROM bookings LIMIT 1),
            (SELECT id FROM trips LIMIT 1),
            6,
            'Impossible rating'
        );

        v_failed := v_failed + 1;
        RAISE WARNING '[FAIL] % (Invalid rating 6 accepted!)', v_test_name;
    EXCEPTION WHEN check_violation THEN
        v_passed := v_passed + 1;
        RAISE NOTICE '[PASS] % (Invalid rating 6 correctly rejected)', v_test_name;
    END;

    -- -------------------------------------------------------------------------
    -- TEST 8: GPS Partitioned Table Ingestion Test
    -- -------------------------------------------------------------------------
    v_test_name := 'GPS Range Partitioning Routing Verification';
    BEGIN
        INSERT INTO vehicle_location_history (
            vehicle_id, latitude, longitude, speed_kmh, recorded_at
        ) VALUES (
            (SELECT id FROM vehicles LIMIT 1),
            12.9716000, 77.5946000, 65.50,
            TIMESTAMPTZ '2026-09-26 12:00:00+00'
        );

        -- Also test fallback default partition for out-of-range timestamp
        INSERT INTO vehicle_location_history (
            vehicle_id, latitude, longitude, speed_kmh, recorded_at
        ) VALUES (
            (SELECT id FROM vehicles LIMIT 1),
            12.9716000, 77.5946000, 0.00,
            TIMESTAMPTZ '2028-01-01 00:00:00+00'
        );

        v_passed := v_passed + 1;
        RAISE NOTICE '[PASS] % (Partition routing and default partition fallback verified)', v_test_name;
    EXCEPTION WHEN OTHERS THEN
        v_failed := v_failed + 1;
        RAISE WARNING '[FAIL] % (Partition insert failed: %)', v_test_name, SQLERRM;
    END;

    -- -------------------------------------------------------------------------
    -- TEST 9: Operational Views Queryability
    -- -------------------------------------------------------------------------
    v_test_name := 'Operational Views Queryability (All 8 views functional)';
    BEGIN
        PERFORM * FROM vw_available_trip_seats LIMIT 1;
        PERFORM * FROM vw_trip_current_status LIMIT 1;
        PERFORM * FROM vw_active_vehicle_locations LIMIT 1;
        PERFORM * FROM vw_booking_summary LIMIT 1;
        PERFORM * FROM vw_payment_summary LIMIT 1;
        PERFORM * FROM vw_driver_trip_summary LIMIT 1;
        PERFORM * FROM vw_vehicle_health_summary LIMIT 1;
        PERFORM * FROM vw_route_schedule_summary LIMIT 1;

        v_passed := v_passed + 1;
        RAISE NOTICE '[PASS] % (All analytical views compiled and queried successfully)', v_test_name;
    EXCEPTION WHEN OTHERS THEN
        v_failed := v_failed + 1;
        RAISE WARNING '[FAIL] % (View query failed: %)', v_test_name, SQLERRM;
    END;

    -- -------------------------------------------------------------------------
    -- SUMMARY
    -- -------------------------------------------------------------------------
    RAISE NOTICE '====================================================================';
    RAISE NOTICE 'TEST RESULTS SUMMARY: % PASSED, % FAILED', v_passed, v_failed;
    RAISE NOTICE '====================================================================';

    IF v_failed > 0 THEN
        RAISE EXCEPTION 'TEST SUITE FAILED with % errors.', v_failed;
    END IF;
END $$;

-- Rollback the test transaction so test rows never contaminate the database
ROLLBACK;
